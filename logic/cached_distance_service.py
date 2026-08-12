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

Connection resilience:
    Supabase's pooler will drop idle server-side connections, and this
    service can go idle for a while between DB lookups during a long
    geocode_missing() batch (rate-limited/sleeping Google Maps calls in
    between). Two things make that survivable:
      1. We keep the ORIGINAL database_url string around ourselves rather
         than relying on psycopg2.connection.dsn for reconnects — .dsn
         redacts the password (since psycopg2 2.7), so reconnecting via
         .dsn silently always fails auth.
      2. Every DB round-trip goes through _execute(), which retries (with
         exponential backoff — 1s, 2s, 4s, 8s by default) after forcing a
         fresh connection whenever the query fails with an
         OperationalError. This covers both "connection died mid-query"
         and brief local DNS/network blips, which need a moment to clear
         and will just fail again on an instant retry.

Usage (see main.py for the actual wiring):
    inner = GoogleMapsDistanceService(api_key=GOOGLE_API_KEY)
    DISTANCE_SERVICE = CachedDistanceService(inner, database_url=DATABASE_URL)

Requires: psycopg2-binary (`uv add psycopg2-binary`)
Env var:  DATABASE_URL (or SUPABASE_DB_URL) — a standard Postgres connection
          string, e.g. postgresql://user:pass@host:5432/postgres

Note: use Supabase's session-mode pooler (port 5432), not the transaction-
mode pooler (port 6543). A long-lived connection like this one, combined
with the ON CONFLICT upserts below, expects session semantics.
"""

import logging
import time
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

        # Keep the real connection string around. psycopg2's conn.dsn
        # redacts the password, so we can't use conn.dsn to reconnect.
        self.database_url = database_url

        self._conn = self._connect()
        self._ensure_schema()

        # Stats for logging/cost visibility — mirrors the pattern used in
        # estimate_cost.py's FakeCoordinateDistanceService, so the two are
        # easy to compare.
        self.geocode_api_calls = 0
        self.geocode_db_hits = 0
        self.travel_time_api_calls = 0
        self.travel_time_db_hits = 0

    def _connect(self):
        conn = psycopg2.connect(
            self.database_url,
            connect_timeout=10,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3,
        )
        conn.autocommit = True
        return conn

    def _ensure_schema(self):
        with self._conn.cursor() as cur:
            cur.execute(_SCHEMA)
        logger.info("CachedDistanceService: schema ensured (geocode_cache, travel_time_cache)")

    def _reconnect_if_needed(self):
        if self._conn.closed:
            logger.warning("CachedDistanceService: connection was closed, reconnecting")
            self._conn = self._connect()

    def _execute(self, query, params, fetch=False, max_retries: int = 4, base_delay: float = 1.0):
        """
        Run a query with retries + backoff. Covers two kinds of transient
        failure seen in practice:
          - the pooler drops an idle server-side connection (server closed
            the connection unexpectedly) -> next attempt reconnects fine.
          - a brief local DNS/network blip (could not translate host name
            ..., or similar) -> an IMMEDIATE retry hits the same blip, so
            this backs off (1s, 2s, 4s, 8s...) to give it a moment to
            clear before trying again.
        Anything still failing after max_retries is re-raised so the
        caller (and the request) fails loudly rather than hanging forever.
        """
        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                self._reconnect_if_needed()
                with self._conn.cursor() as cur:
                    cur.execute(query, params)
                    return cur.fetchone() if fetch else None
            except psycopg2.OperationalError as e:
                last_err = e
                try:
                    self._conn.close()
                except Exception:
                    pass

                if attempt == max_retries:
                    logger.error(
                        "CachedDistanceService: query failed after %d attempts (%s), giving up",
                        attempt, e,
                    )
                    break

                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    "CachedDistanceService: query failed (attempt %d/%d): %s "
                    "— retrying in %.1fs",
                    attempt, max_retries, e, delay,
                )
                time.sleep(delay)
        raise last_err

    # -- geocoding -----------------------------------------------------

    def geocode(self, address: str, landmark_fallback: Optional[str] = None) -> Tuple[float, float]:
        key = (address or "").strip()

        row = self._execute(
            "SELECT latitude, longitude FROM geocode_cache WHERE address = %s",
            (key,),
            fetch=True,
        )

        if row is not None:
            self.geocode_db_hits += 1
            logger.debug("CachedDistanceService.geocode() DB hit for %r", key)
            return (row[0], row[1])

        # Miss — delegate to the real service (this is the billable call)
        self.geocode_api_calls += 1
        logger.debug("CachedDistanceService.geocode() DB miss for %r, calling inner service", key)
        coords = self.inner.geocode(address, landmark_fallback=landmark_fallback)

        self._execute(
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

        row = self._execute(
            """
            SELECT minutes FROM travel_time_cache
            WHERE origin_lat = %s AND origin_lon = %s
              AND dest_lat = %s AND dest_lon = %s
              AND mode = %s
            """,
            (o[0], o[1], d[0], d[1], mode),
            fetch=True,
        )

        if row is not None:
            self.travel_time_db_hits += 1
            logger.debug("CachedDistanceService.travel_time() DB hit for %r -> %r", o, d)
            return row[0]

        self.travel_time_api_calls += 1
        logger.debug("CachedDistanceService.travel_time() DB miss for %r -> %r, calling inner service", o, d)
        minutes = self.inner.travel_time(origin, destination)

        self._execute(
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