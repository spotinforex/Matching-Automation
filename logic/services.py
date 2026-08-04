"""
distance_service.py

Defines the interface the Matcher depends on for geocoding and travel time.
Swap in a real implementation (Google Maps Geocoding + Distance Matrix, OSRM,
etc.) by subclassing DistanceService — nothing else in the app needs to change.

Per the agreed fallback rule: geocode(address) should try the full address
first, and fall back to geocoding the landmark name if that fails.
"""

import time
from abc import ABC, abstractmethod
from typing import Optional, Tuple

import requests


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

        if address:
            try:
                return self._geocode_one(self._with_region_hint(address))
            except ValueError:
                pass  # fall through to landmark fallback

        if landmark_fallback:
            landmark_fallback = landmark_fallback.strip()
            if landmark_fallback:
                return self._geocode_one(self._with_region_hint(landmark_fallback))

        raise ValueError(
            f"Could not geocode address '{address}' or fallback landmark '{landmark_fallback}'"
        )

    def _with_region_hint(self, text: str) -> str:
        if self.region_hint and self.region_hint.lower() not in text.lower():
            return f"{text}, {self.region_hint}"
        return text

    def _geocode_one(self, query: str) -> Tuple[float, float]:
        if query in self._geocode_cache:
            return self._geocode_cache[query]

        params = {"address": query, "key": self.api_key}
        data = self._request_with_retry(self.GEOCODE_URL, params)

        status = data.get("status")
        results = data.get("results") or []
        if status != "OK" or not results:
            raise ValueError(f"Geocoding failed for '{query}': status={status}")

        location = results[0]["geometry"]["location"]
        coords = (location["lat"], location["lng"])
        self._geocode_cache[query] = coords
        return coords

    # -- travel time -----------------------------------------------------

    def travel_time(self, origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
        cache_key = (origin, destination, self.mode)
        if cache_key in self._travel_time_cache:
            return self._travel_time_cache[cache_key]

        params = {
            "origins": f"{origin[0]},{origin[1]}",
            "destinations": f"{destination[0]},{destination[1]}",
            "mode": self.mode,
            "key": self.api_key,
        }
        data = self._request_with_retry(self.DISTANCE_MATRIX_URL, params)

        if data.get("status") != "OK":
            raise ValueError(f"Distance Matrix request failed: status={data.get('status')}")

        try:
            element = data["rows"][0]["elements"][0]
        except (IndexError, KeyError):
            raise ValueError("Distance Matrix response missing expected rows/elements")

        if element.get("status") != "OK":
            raise ValueError(f"Distance Matrix element failed: status={element.get('status')}")

        duration_seconds = element["duration"]["value"]
        minutes = duration_seconds / 60.0

        self._travel_time_cache[cache_key] = minutes
        return minutes

    # -- shared request helper -----------------------------------------------------

    def _request_with_retry(self, url: str, params: dict) -> dict:
        attempt = 0
        while True:
            response = self._session.get(url, params=params, timeout=self.timeout_seconds)
            response.raise_for_status()
            data = response.json()

            status = data.get("status")
            if status not in self.RETRYABLE_STATUSES or attempt >= self.max_retries:
                return data

            attempt += 1
            time.sleep(self.retry_backoff_seconds * attempt)


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