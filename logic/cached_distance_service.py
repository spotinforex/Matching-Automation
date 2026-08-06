"""
cached_distance_service.py

Wraps any DistanceService (e.g. GoogleMapsDistanceService) with a Postgres
(Supabase) backed cache, checked BEFORE every geocode/travel_time API call.

Why this matters: the existing in-memory cache on GoogleMapsDistanceService
only survives for the lifetime of one running process. On Cloud Run, that
process can restart, redeploy, or cold-start at any time — the container
filesystem itself is ephemeral, so even writing to a local file wouldn't
help. A real external database is what makes the cache actually durable
across restarts, and (if you ever go beyond --workers 1 / one instance)
shared across processes too.

Cache keys mirror the ones already used by GoogleMapsDistanceService's
in-memory caches exactly:
    - geocode:     keyed by the raw address string (same as matcher.py's
                    own per-run `cache` dict, keyed by person.address)
    - travel_time: keyed by (origin, destination, mode), coordinates
                    rounded to `coord_precision` decimal places so repeat
                    lookups hit even if float formatting drifts slightly
                    across processes/languages (6 decimals ~= 11cm, far
                    tighter than geocoding accuracy, so this never causes
                    a meaningfully wrong cache hit).

Geocoding failures (ValueError) are NOT cached — a transient failure today
shouldn't permanently block a future retry.

Usage (see main.py for the actual wiring):
    inner = GoogleMapsDistanceService(api_key=GOOGLE_API_KEY)
    DISTANCE_SERVICE = CachedDistanceService(inner, database_url=DATABASE_URL)

Requires: psycopg2-binary (`uv add psycopg2-binary`)
Env var:  DATABASE_URL (or SUPABASE_DB_URL) — a standard Postgres connection
          string, e.g. postgresql://user:pass@host:5432/postgres
"""

import logging
from typing import Optional, Tuple

import psycopg2
import psycopg2.extras

from logic.services import DistanceService

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS geocode_cache (
    address     TEXT PRIMARY KEY,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS travel_time_cache (
    origin_lat   DOUBLE PRECISION NOT NULL,
    origin_lon   DOUBLE PRECISION NOT NULL,
    dest_lat     DOUBLE PRECISION NOT NULL,
    dest_lon     DOUBLE PRECISION NOT NULL,
    mode         TEXT NOT NULL,
    minutes      DOUBLE PRECISION NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (origin_lat, origin_lon, dest_lat, dest_lon, mode)
);
"""


class CachedDistanceService(DistanceService):

    def __init__(self, inner: DistanceService, database_url: str, coord_precision: int = 6):
        self.inner = inner
        self.coord_precision = coord_precision

        self._conn = psycopg2.connect(database_url)
        self._conn.autocommit = True
        self._ensure_schema()

        # Stats for logging/cost visibility — mirrors the pattern used in
        # estimate_cost.py's FakeCoordinateDistanceService, so the two are
        # easy to compare.
        self.geocode_api_calls = 0
        self.geocode_db_hits = 0
        self.travel_time_api_calls = 0
        self.travel_time_db_hits = 0

    def _ensure_schema(self):
        with self._conn.cursor() as cur:
            cur.execute(_SCHEMA)
        logger.info("CachedDistanceService: schema ensured (geocode_cache, travel_time_cache)")

    def _reconnect_if_needed(self):
        if self._conn.closed:
            logger.warning("CachedDistanceService: connection was closed, reconnecting")
            self._conn = psycopg2.connect(self._conn.dsn)
            self._conn.autocommit = True

    # -- geocoding -----------------------------------------------------

    def geocode(self, address: str, landmark_fallback: Optional[str] = None) -> Tuple[float, float]:
        key = (address or "").strip()
        self._reconnect_if_needed()

        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT latitude, longitude FROM geocode_cache WHERE address = %s",
                (key,),
            )
            row = cur.fetchone()

        if row is not None:
            self.geocode_db_hits += 1
            logger.debug("CachedDistanceService.geocode() DB hit for %r", key)
            return (row[0], row[1])

        # Miss — delegate to the real service (this is the billable call)
        self.geocode_api_calls += 1
        logger.debug("CachedDistanceService.geocode() DB miss for %r, calling inner service", key)
        coords = self.inner.geocode(address, landmark_fallback=landmark_fallback)

        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO geocode_cache (address, latitude, longitude)
                VALUES (%s, %s, %s)
                ON CONFLICT (address) DO NOTHING
                """,
                (key, coords[0], coords[1]),
            )

        return coords

    # -- travel time -----------------------------------------------------

    def travel_time(self, origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
        mode = getattr(self.inner, "mode", "driving")
        o = self._round(origin)
        d = self._round(destination)
        self._reconnect_if_needed()

        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT minutes FROM travel_time_cache
                WHERE origin_lat = %s AND origin_lon = %s
                  AND dest_lat = %s AND dest_lon = %s
                  AND mode = %s
                """,
                (o[0], o[1], d[0], d[1], mode),
            )
            row = cur.fetchone()

        if row is not None:
            self.travel_time_db_hits += 1
            logger.debug("CachedDistanceService.travel_time() DB hit for %r -> %r", o, d)
            return row[0]

        self.travel_time_api_calls += 1
        logger.debug("CachedDistanceService.travel_time() DB miss for %r -> %r, calling inner service", o, d)
        minutes = self.inner.travel_time(origin, destination)

        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO travel_time_cache
                    (origin_lat, origin_lon, dest_lat, dest_lon, mode, minutes)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (origin_lat, origin_lon, dest_lat, dest_lon, mode) DO NOTHING
                """,
                (o[0], o[1], d[0], d[1], mode, minutes),
            )

        return minutes

    def _round(self, point: Tuple[float, float]) -> Tuple[float, float]:
        return (round(point[0], self.coord_precision), round(point[1], self.coord_precision))

    def log_summary(self):
        logger.info(
            "CachedDistanceService summary: geocode %d API calls / %d DB hits, "
            "travel_time %d API calls / %d DB hits",
            self.geocode_api_calls, self.geocode_db_hits,
            self.travel_time_api_calls, self.travel_time_db_hits,
        )