"""
services.py

Defines the interface the Matcher depends on for geocoding and travel time.
Swap in a real implementation (Google Maps Geocoding + Routes API, OSRM,
etc.) by subclassing DistanceService — nothing else in the app needs to change.

Per the agreed fallback rule: geocode(address) should try the full address
first, and fall back to geocoding the landmark name if that fails.

Geographic scope: GoogleMapsDistanceService can be pinned to any one Nigerian
state (or the FCT) with a hard Google `components` filter, or left open
(state=None) so addresses anywhere in Nigeria resolve. See resolve_state().
"""

import logging
import time
from abc import ABC, abstractmethod
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Nigerian states
# ---------------------------------------------------------------------------

# The 36 states, spelled the way Google's administrative_area filter expects
# once " State" is appended (same format the Abia-only version used).
NIGERIA_STATES = (
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
    "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
    "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
    "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
    "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
)

# Not a state, but a first-level administrative area Google treats the same
# way, and Abuja addresses are common — so it's selectable alongside them.
FCT_NAME = "Federal Capital Territory"

# Values meaning "don't restrict to any state".
_OPEN_VALUES = {"", "any", "none", "open", "all", "no filter", "nofilter"}

_STATE_LOOKUP = {name.lower(): name for name in NIGERIA_STATES}
_STATE_LOOKUP.update({
    FCT_NAME.lower(): FCT_NAME,
    "fct": FCT_NAME,
    "abuja": FCT_NAME,
    "fct abuja": FCT_NAME,
})


def resolve_state(value) -> Optional[str]:
    """
    Normalizes user input to a canonical state name, or None for "no state
    filter".

      resolve_state("abia")        -> "Abia"
      resolve_state("Lagos State") -> "Lagos"
      resolve_state("FCT")         -> "Federal Capital Territory"
      resolve_state("any")         -> None   (also None, "", "none", "open", "all")

    Raises ValueError for anything that isn't recognised, so a typo fails
    loudly instead of silently running with the wrong (or no) filter.
    """
    if value is None:
        return None

    cleaned = " ".join(str(value).strip().lower().split())
    if cleaned in _OPEN_VALUES:
        return None

    if cleaned.endswith(" state"):
        cleaned = cleaned[: -len(" state")].strip()

    canonical = _STATE_LOOKUP.get(cleaned)
    if canonical is None:
        raise ValueError(
            f"Unknown Nigerian state {value!r}. Use one of the 36 states, 'FCT', "
            f"or 'any' for no state filter."
        )
    return canonical


def _state_label(state: str) -> str:
    """Google-facing name: 'Abia' -> 'Abia State', FCT stays as-is."""
    return state if state == FCT_NAME else f"{state} State"


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class DistanceService(ABC):

    @property
    def scope_key(self) -> str:
        """
        Identifies the geographic scope this service resolves addresses in.
        Anything that caches geocode results (e.g. CachedDistanceService)
        should include this in its cache key — the same address text can
        resolve to different places under different scopes.
        """
        return "default"

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
    Google Maps Geocoding API + Routes API (computeRoutes) implementation.

    - geocode(): tries the full address first (with a region hint appended
      for better hit rate on short/ambiguous addresses), falls back to
      geocoding the landmark name if the full address doesn't resolve.
    - travel_time(): uses the Routes API `computeRoutes` method (driving by
      default). This replaces the legacy Distance Matrix API.
    - Both calls are cached in-memory for the lifetime of this instance, since
      the same addresses/pairs repeat heavily across matching rounds and both
      APIs are billed per request.

    Setup: the "Routes API" must be enabled on your Google Cloud project, and
    if your API key has API restrictions, Routes API must be on its allowlist.

    Geographic scope (set once per instance):
      state="Lagos"  -> hard filter: results must be inside Lagos State
                        (Google `components=administrative_area:Lagos State|country:NG`)
      state=None     -> open: no state restriction, only country:NG, so
                        addresses anywhere in Nigeria resolve
    `state` accepts anything resolve_state() understands ("lagos",
    "Lagos State", "FCT", "any", ...). The state filter applies to geocoding
    only; routing works on raw coordinates.

    city_hint (optional) only sharpens the text appended to short addresses
    (e.g. "Aba" -> "Aba, Abia State, Nigeria"); it is never a hard filter.
    Pass region_hint to override the generated hint text entirely.

    Travel mode / routing:
      mode accepts Routes API names ("DRIVE", "WALK", "BICYCLE", "TRANSIT",
      "TWO_WHEELER") or the legacy lowercase names ("driving", "walking",
      "bicycling", "transit").
      routing_preference applies only to DRIVE / TWO_WHEELER:
        "TRAFFIC_UNAWARE" (default) - typical durations, cheapest SKU, and
                                      matches the old Distance Matrix default.
        "TRAFFIC_AWARE" / "TRAFFIC_AWARE_OPTIMAL" - uses live traffic; higher
                                      latency and a higher-priced SKU.
      Note that TRANSIT may require extra fields (e.g. departure time) and
      isn't supported everywhere; stick to DRIVE unless you've verified it.

    Because the in-memory caches belong to the instance and scope is fixed
    per instance, build one instance per scope rather than mutating `state`
    on a shared one.

    SECURITY NOTE: pass the API key via an environment variable
    (e.g. os.environ["GOOGLE_MAPS_API_KEY"]), never hardcode it in source.
    """

    GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
    ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

    COUNTRY_CODE = "NG"
    COUNTRY_NAME = "Nigeria"

    # Geocoding API: statuses (in the JSON body) worth a short retry.
    RETRYABLE_STATUSES = {"OVER_QUERY_LIMIT", "UNKNOWN_ERROR"}

    # Routes API: errors come back as real HTTP status codes, not a body
    # "status" field. 429 = quota/rate limit; 5xx = transient server trouble.
    RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}

    # Only ask Google for what we use — the field mask is mandatory for the
    # Routes API and also controls which billing SKU applies.
    ROUTES_FIELD_MASK = "routes.duration"

    # Legacy Distance Matrix mode names -> Routes API travel modes.
    _MODE_MAP = {
        "driving": "DRIVE",
        "walking": "WALK",
        "bicycling": "BICYCLE",
        "transit": "TRANSIT",
        "drive": "DRIVE",
        "walk": "WALK",
        "bicycle": "BICYCLE",
        "two_wheeler": "TWO_WHEELER",
    }

    # Travel modes for which routingPreference is valid.
    _ROUTING_PREFERENCE_MODES = {"DRIVE", "TWO_WHEELER"}

    def __init__(
        self,
        api_key: str,
        state: Optional[str] = None,
        city_hint: Optional[str] = None,
        region_hint: Optional[str] = None,
        mode: str = "driving",
        routing_preference: str = "TRAFFIC_UNAWARE",
        max_retries: int = 2,
        retry_backoff_seconds: float = 1.0,
        timeout_seconds: float = 10.0,
    ):
        if not api_key:
            raise ValueError("GoogleMapsDistanceService requires a non-empty api_key")
        self.api_key = api_key
        self.state = resolve_state(state)  # canonical name, or None = open
        self.city_hint = (city_hint or "").strip() or None
        self._region_hint_overridden = region_hint is not None
        self.region_hint = region_hint if region_hint is not None else self._build_region_hint()
        self.mode = mode
        self.travel_mode = self._resolve_travel_mode(mode)
        self.routing_preference = (routing_preference or "").strip().upper() or None
        self.max_retries = max_retries
        self.retry_backoff_seconds = retry_backoff_seconds
        self.timeout_seconds = timeout_seconds

        self._session = requests.Session()
        self._geocode_cache: dict = {}
        self._travel_time_cache: dict = {}

        logger.info(
            "GoogleMapsDistanceService scope: state=%s city_hint=%s region_hint=%r components=%r "
            "travel_mode=%s routing_preference=%s",
            self.state or "(open — no state filter)", self.city_hint,
            self.region_hint, self._components(),
            self.travel_mode, self._effective_routing_preference(),
        )

    # -- scope -------------------------------------------------------------

    @property
    def scope_key(self) -> str:
        """
        Everything that changes what an address resolves to: the state
        filter, the city hint, and (if supplied) a custom region_hint.
        e.g. "NG:Abia:Aba", "NG:Lagos", "NG:*". Anything caching geocode
        results across runs (CachedDistanceService) keys on this.
        """
        key = f"{self.COUNTRY_CODE}:{self.state or '*'}"
        if self.city_hint:
            key += f":{self.city_hint}"
        if self._region_hint_overridden:
            key += f"|{self.region_hint}"
        return key

    def _build_region_hint(self) -> str:
        parts = []
        if self.city_hint:
            parts.append(self.city_hint)
        if self.state:
            parts.append(_state_label(self.state))
        parts.append(self.COUNTRY_NAME)
        return ", ".join(parts)

    def _components(self) -> str:
        """The hard filter sent to Google. Country always; state only when set."""
        if self.state:
            return f"administrative_area:{_state_label(self.state)}|country:{self.COUNTRY_CODE}"
        return f"country:{self.COUNTRY_CODE}"

    @classmethod
    def _resolve_travel_mode(cls, mode: str) -> str:
        """Maps legacy/lowercase mode names to Routes API travel modes."""
        key = (mode or "").strip().lower()
        travel_mode = cls._MODE_MAP.get(key)
        if travel_mode is None:
            raise ValueError(
                f"Unknown travel mode {mode!r}. Use one of: "
                f"DRIVE, WALK, BICYCLE, TRANSIT, TWO_WHEELER (or driving/walking/bicycling/transit)."
            )
        return travel_mode

    def _effective_routing_preference(self) -> Optional[str]:
        """routingPreference is only valid for DRIVE / TWO_WHEELER."""
        if self.travel_mode in self._ROUTING_PREFERENCE_MODES:
            return self.routing_preference
        return None

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
            "region": self.COUNTRY_CODE.lower(),  # ccTLD bias — nudges ranking toward Nigeria
            "components": self._components(),  # hard filter (state + country, or country only)
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
        routing_preference = self._effective_routing_preference()
        cache_key = (origin, destination, self.travel_mode, routing_preference)
        if cache_key in self._travel_time_cache:
            logger.debug("travel_time() cache hit for %r", cache_key)
            return self._travel_time_cache[cache_key]

        logger.info(
            "travel_time() calling Routes API: origin=%r destination=%r mode=%s routing_preference=%s",
            origin, destination, self.travel_mode, routing_preference,
        )
        body = {
            "origin": self._waypoint(origin),
            "destination": self._waypoint(destination),
            "travelMode": self.travel_mode,
        }
        if routing_preference:
            body["routingPreference"] = routing_preference

        data = self._routes_request_with_retry(body)

        routes = data.get("routes") or []
        if not routes:
            # The Routes API returns HTTP 200 with an empty body ({}) when no
            # route exists between the two points.
            logger.warning("travel_time() no route found: origin=%r destination=%r", origin, destination)
            raise ValueError(f"Routes API found no route from {origin} to {destination}")

        duration = routes[0].get("duration")
        if duration is None:
            logger.error("travel_time() response missing duration: %r", data)
            raise ValueError("Routes API response missing route duration")

        try:
            minutes = self._parse_duration_seconds(duration) / 60.0
        except ValueError:
            logger.error("travel_time() unparseable duration %r", duration)
            raise

        self._travel_time_cache[cache_key] = minutes
        logger.debug("travel_time() resolved %r -> %.1f min (cached)", cache_key, minutes)
        return minutes

    @staticmethod
    def _waypoint(point: Tuple[float, float]) -> dict:
        """(lat, lon) -> Routes API waypoint."""
        return {"location": {"latLng": {"latitude": point[0], "longitude": point[1]}}}

    @staticmethod
    def _parse_duration_seconds(duration) -> float:
        """
        The Routes API returns durations as protobuf Duration JSON strings,
        e.g. "1234s" or "1234.5s". Returns seconds as a float.
        """
        text = str(duration).strip()
        if text.endswith("s"):
            text = text[:-1]
        try:
            return float(text)
        except ValueError:
            raise ValueError(f"Unrecognised Routes API duration format: {duration!r}")

    # -- shared request helpers -----------------------------------------------------

    def _routes_request_with_retry(self, body: dict) -> dict:
        """
        POSTs to Routes API computeRoutes, retrying on transient failures:
          - network-level errors (timeouts, connection resets)
          - HTTP statuses in RETRYABLE_HTTP_STATUSES (429 quota, 5xx)
        All retry exhaustion and non-retryable errors (400 bad request,
        403 API not enabled / key restricted, ...) surface as ValueError,
        including Google's own error message, so callers get one consistent
        failure type.

        Unlike the Geocoding API, the Routes API reports errors through the
        HTTP status code and a {"error": {...}} body, not a "status" field.
        """
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": self.ROUTES_FIELD_MASK,
        }
        attempt = 0
        while True:
            logger.debug(
                "_routes_request_with_retry() attempt=%d url=%s body=%s",
                attempt + 1, self.ROUTES_URL, body,
            )
            start = time.monotonic()
            try:
                response = self._session.post(
                    self.ROUTES_URL, json=body, headers=headers, timeout=self.timeout_seconds,
                )
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
                elapsed = time.monotonic() - start
                logger.warning(
                    "_routes_request_with_retry() attempt=%d network error after %.2fs: %s",
                    attempt + 1, elapsed, exc,
                )
                if attempt >= self.max_retries:
                    logger.error(
                        "_routes_request_with_retry() giving up after %d attempt(s)", attempt + 1,
                    )
                    raise ValueError(
                        f"Routes API request failed after {attempt + 1} attempt(s): {exc}"
                    ) from exc
                attempt += 1
                time.sleep(self.retry_backoff_seconds * attempt)
                continue
            except requests.exceptions.RequestException as exc:
                logger.error("_routes_request_with_retry() request error: %s", exc)
                raise ValueError(f"Routes API request error: {exc}") from exc

            elapsed = time.monotonic() - start
            logger.debug(
                "_routes_request_with_retry() attempt=%d got HTTP %d in %.2fs",
                attempt + 1, response.status_code, elapsed,
            )

            if response.ok:
                try:
                    return response.json()
                except ValueError as exc:
                    raise ValueError(f"Routes API returned invalid JSON: {exc}") from exc

            if response.status_code in self.RETRYABLE_HTTP_STATUSES and attempt < self.max_retries:
                attempt += 1
                logger.info(
                    "_routes_request_with_retry() retryable HTTP %d (attempt %d/%d), retrying",
                    response.status_code, attempt, self.max_retries + 1,
                )
                time.sleep(self.retry_backoff_seconds * attempt)
                continue

            message = self._extract_routes_error(response)
            logger.error(
                "_routes_request_with_retry() HTTP %d from Routes API: %s",
                response.status_code, message,
            )
            raise ValueError(f"Routes API returned HTTP {response.status_code}: {message}")

    @staticmethod
    def _extract_routes_error(response) -> str:
        """Pulls Google's error status/message out of a failed response, if present."""
        try:
            error = response.json().get("error", {})
            status = error.get("status")
            message = error.get("message")
            if status or message:
                return f"{status or 'ERROR'}: {message or ''}".strip()
        except ValueError:
            pass
        return (response.text or "").strip()[:300] or "no error details"

    def _request_with_retry(self, url: str, params: dict) -> dict:
        """
        GET helper for the Geocoding API. Sends the request, retrying on
        transient failures:
          - network-level errors (timeouts, connection resets) — retried up
            to max_retries, then surfaced as ValueError so callers (notably
            geocode()'s landmark fallback, which only catches ValueError)
            can still recover instead of the whole batch dying on one
            slow/dropped request.
          - Google API-level transient statuses (RETRYABLE_STATUSES) — same
            retry budget.
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