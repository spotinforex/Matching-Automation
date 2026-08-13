"""
distance_service.py

Defines the interface the Matcher depends on for geocoding and travel time.
Swap in a real implementation (Google Maps Geocoding + Distance Matrix, OSRM,
etc.) by subclassing DistanceService — nothing else in the app needs to change.

Per the agreed fallback rule: geocode(address) should try the full address
first, and fall back to geocoding the landmark name if that fails.
"""

import logging
import time
from abc import ABC, abstractmethod
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)


class DistanceService(ABC):

    @abstractmethod
    def geocode(self, address: str, landmark_fallback: Optional[str] = None) -> Tuple[float, float]:
        """
        Return (latitude, longitude) for an address.
        Implementations should try the full address first, and fall back to
        geocoding `landmark_fallback` (e.g. "Ariaria, Aba, Abia State, Nigeria")
        if the full address can't be resolved.
        Raise ValueError if neither resolves.
        """
        raise NotImplementedError

    @abstractmethod
    def travel_time(self, origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
        """Return travel time in minutes between two (lat, lon) points."""
        raise NotImplementedError


class GoogleMapsDistanceService(DistanceService):
    """
    Google Maps Geocoding API + Distance Matrix API implementation.

    - geocode(): tries the full address first (with region_hint appended for
      better hit rate on short/ambiguous addresses), falls back to geocoding
      the landmark name if the full address doesn't resolve.
    - travel_time(): uses the Distance Matrix API (driving mode by default).
    - Both calls are cached in-memory for the lifetime of this instance, since
      the same addresses/pairs repeat heavily across matching rounds and both
      APIs are billed per request.

    SECURITY NOTE: pass the API key via an environment variable
    (e.g. os.environ["GOOGLE_MAPS_API_KEY"]), never hardcode it in source.
    """

    GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
    DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"

    # Statuses worth a short retry (transient/quota); anything else fails fast.
    RETRYABLE_STATUSES = {"OVER_QUERY_LIMIT", "UNKNOWN_ERROR"}

    def __init__(
        self,
        api_key: str,
        region_hint: str = "Aba, Abia State, Nigeria",
        mode: str = "driving",
        max_retries: int = 2,
        retry_backoff_seconds: float = 1.0,
        timeout_seconds: float = 10.0,
    ):
        if not api_key:
            raise ValueError("GoogleMapsDistanceService requires a non-empty api_key")
        self.api_key = api_key
        self.region_hint = region_hint
        self.mode = mode
        self.max_retries = max_retries
        self.retry_backoff_seconds = retry_backoff_seconds
        self.timeout_seconds = timeout_seconds

        self._session = requests.Session()
        self._geocode_cache: dict = {}
        self._travel_time_cache: dict = {}

    # -- geocoding -----------------------------------------------------

    def geocode(self, address: str, landmark_fallback: Optional[str] = None) -> Tuple[float, float]:
        address = (address or "").strip()
        logger.debug("geocode() called: address=%r landmark_fallback=%r", address, landmark_fallback)

        if address:
            try:
                coords = self._geocode_one(self._with_region_hint(address))
                logger.debug("geocode() resolved address %r -> %r", address, coords)
                return coords
            except ValueError as exc:
                logger.warning(
                    "geocode() failed for address %r (%s); trying landmark fallback %r",
                    address, exc, landmark_fallback,
                )

        if landmark_fallback:
            landmark_fallback = landmark_fallback.strip()
            if landmark_fallback:
                try:
                    coords = self._geocode_one(self._with_region_hint(landmark_fallback))
                    logger.debug("geocode() resolved landmark %r -> %r", landmark_fallback, coords)
                    return coords
                except ValueError as exc:
                    logger.warning("geocode() landmark fallback %r also failed: %s", landmark_fallback, exc)
                    raise

        logger.error(
            "geocode() exhausted: address=%r landmark_fallback=%r", address, landmark_fallback
        )
        raise ValueError(
            f"Could not geocode address '{address}' or fallback landmark '{landmark_fallback}'"
        )

    def _with_region_hint(self, text: str) -> str:
        if self.region_hint and self.region_hint.lower() not in text.lower():
            return f"{text}, {self.region_hint}"
        return text

    def _geocode_one(self, query: str) -> Tuple[float, float]:
        if query in self._geocode_cache:
            logger.debug("_geocode_one() cache hit for %r", query)
            return self._geocode_cache[query]

        logger.info("_geocode_one() calling Geocoding API for %r", query)
        params = {
            "address": query,
            "key": self.api_key,
            "region": "ng",  # ccTLD bias — nudges ranking toward Nigeria
            "components": "administrative_area:Abia State|country:NG",  # hard filter
        }
        data = self._request_with_retry(self.GEOCODE_URL, params)

        status = data.get("status")
        results = data.get("results") or []
        if status != "OK" or not results:
            logger.warning("_geocode_one() no result for %r: status=%s", query, status)
            raise ValueError(f"Geocoding failed for '{query}': status={status}")

        location = results[0]["geometry"]["location"]
        coords = (location["lat"], location["lng"])
        self._geocode_cache[query] = coords
        logger.debug("_geocode_one() resolved %r -> %r (cached)", query, coords)
        return coords

    # -- travel time -----------------------------------------------------

    def travel_time(self, origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
        cache_key = (origin, destination, self.mode)
        if cache_key in self._travel_time_cache:
            logger.debug("travel_time() cache hit for %r", cache_key)
            return self._travel_time_cache[cache_key]

        logger.info("travel_time() calling Distance Matrix API: origin=%r destination=%r mode=%s",
                    origin, destination, self.mode)
        params = {
            "origins": f"{origin[0]},{origin[1]}",
            "destinations": f"{destination[0]},{destination[1]}",
            "mode": self.mode,
            "key": self.api_key,
        }
        data = self._request_with_retry(self.DISTANCE_MATRIX_URL, params)

        if data.get("status") != "OK":
            logger.warning("travel_time() request-level failure: status=%s", data.get("status"))
            raise ValueError(f"Distance Matrix request failed: status={data.get('status')}")

        try:
            element = data["rows"][0]["elements"][0]
        except (IndexError, KeyError):
            logger.error("travel_time() response missing expected rows/elements: %r", data)
            raise ValueError("Distance Matrix response missing expected rows/elements")

        if element.get("status") != "OK":
            logger.warning("travel_time() element-level failure: status=%s", element.get("status"))
            raise ValueError(f"Distance Matrix element failed: status={element.get('status')}")

        duration_seconds = element["duration"]["value"]
        minutes = duration_seconds / 60.0

        self._travel_time_cache[cache_key] = minutes
        logger.debug("travel_time() resolved %r -> %.1f min (cached)", cache_key, minutes)
        return minutes

    # -- shared request helper -----------------------------------------------------

    def _request_with_retry(self, url: str, params: dict) -> dict:
        """
        Sends the request, retrying on transient failures:
          - network-level errors (timeouts, connection resets) — retried up
            to max_retries, then surfaced as ValueError so callers (notably
            geocode()'s landmark fallback, which only catches ValueError)
            can still recover instead of the whole batch dying on one
            slow/dropped request.
          - Google API-level transient statuses (RETRYABLE_STATUSES) — same
            retry budget, unchanged from before.
        Non-retryable HTTP errors (4xx/5xx) fail fast as ValueError.
        """
        attempt = 0
        while True:
            logger.debug(
                "_request_with_retry() attempt=%d url=%s params=%s",
                attempt + 1, url, self._redact(params),
            )
            start = time.monotonic()
            try:
                response = self._session.get(url, params=params, timeout=self.timeout_seconds)
                elapsed = time.monotonic() - start
                response.raise_for_status()
                data = response.json()
                logger.debug(
                    "_request_with_retry() attempt=%d got HTTP %d in %.2fs (status=%s)",
                    attempt + 1, response.status_code, elapsed, data.get("status"),
                )
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
                elapsed = time.monotonic() - start
                logger.warning(
                    "_request_with_retry() attempt=%d network error after %.2fs: %s",
                    attempt + 1, elapsed, exc,
                )
                if attempt >= self.max_retries:
                    logger.error(
                        "_request_with_retry() giving up on %s after %d attempt(s)",
                        url, attempt + 1,
                    )
                    raise ValueError(
                        f"Request to {url} failed after {attempt + 1} attempt(s): {exc}"
                    ) from exc
                attempt += 1
                sleep_for = self.retry_backoff_seconds * attempt
                logger.info("_request_with_retry() retrying in %.1fs (attempt %d/%d)",
                            sleep_for, attempt + 1, self.max_retries + 1)
                time.sleep(sleep_for)
                continue
            except requests.exceptions.HTTPError as exc:
                logger.error("_request_with_retry() HTTP error from %s: %s", url, exc)
                raise ValueError(f"Request to {url} returned HTTP error: {exc}") from exc

            status = data.get("status")
            if status not in self.RETRYABLE_STATUSES or attempt >= self.max_retries:
                return data

            logger.info(
                "_request_with_retry() retryable API status=%s (attempt %d/%d), retrying",
                status, attempt + 1, self.max_retries + 1,
            )
            attempt += 1
            time.sleep(self.retry_backoff_seconds * attempt)

    @staticmethod
    def _redact(params: dict) -> dict:
        """Copy of params with the API key masked, safe to log."""
        redacted = dict(params)
        if "key" in redacted:
            redacted["key"] = "***"
        return redacted


class HaversineDistanceService(DistanceService):
    """
    Offline fallback / local testing implementation — no external API calls.
    Estimates travel time from straight-line distance at an assumed average
    speed. Useful for testing the matching logic end-to-end before the real
    Google integration is wired in, NOT accurate enough for production.
    """

    def __init__(self, coordinate_lookup: dict, avg_speed_kmh: float = 25.0):
        # coordinate_lookup: address (or landmark) -> (lat, lon), pre-populated
        # by the caller (e.g. from a fixture) since there's no real geocoder here.
        self.coordinate_lookup = coordinate_lookup
        self.avg_speed_kmh = avg_speed_kmh

    def geocode(self, address: str, landmark_fallback: Optional[str] = None) -> Tuple[float, float]:
        if address in self.coordinate_lookup:
            return self.coordinate_lookup[address]
        if landmark_fallback and landmark_fallback in self.coordinate_lookup:
            return self.coordinate_lookup[landmark_fallback]
        raise ValueError(f"No coordinates available for '{address}' or fallback '{landmark_fallback}'")

    def travel_time(self, origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
        import math

        lat1, lon1 = origin
        lat2, lon2 = destination
        R = 6371.0
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        distance_km = 2 * R * math.asin(math.sqrt(a))
        return (distance_km / self.avg_speed_kmh) * 60  # minutes