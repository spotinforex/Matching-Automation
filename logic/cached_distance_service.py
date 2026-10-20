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

Cache keys:
    - geocode:     keyed by (scope, address), where scope is the inner
                    service's geographic scope (inner.scope_key, e.g.
                    "NG:Abia:Aba", "NG:Lagos", "NG:*" for no state filter).
                    The same address text can resolve to different places
                    under different state filters / city hints, so a result
                    cached under one scope must never be served for another.
    - travel_time: keyed by (origin, destination, mode), coordinates
                    rounded to `coord_precision` decimal places so repeat
                    lookups hit even if float formatting drifts slightly
                    across processes/languages (6 decimals ~= 11cm, far
                    tighter than geocoding accuracy, so this never causes
                    a meaningfully wrong cache hit). Not scoped: travel time
                    between two coordinates doesn't depend on the state filter.

Migration: geocode_cache used to be keyed by address alone, and every row in
it was geocoded under the original Aba / Abia State scope. _ensure_schema()
upgrades an existing table in place — existing rows are labelled
LEGACY_GEOCODE_SCOPE and the primary key becomes (scope, address) — so the
existing cache keeps working for Abia runs and nothing needs re-geocoding.

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

Usage (see main.py for the actual wiring — one instance per geographic scope):
    inner = GoogleMapsDistanceService(api_key=GOOGLE_API_KEY, state="Lagos")
    service = CachedDistanceService(inner, database_url=DATABASE_URL)

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

# Every geocode_cache row that existed before scoping was produced by the
# Aba / Abia State service (hint "Aba, Abia State, Nigeria", filter
# administrative_area:Abia State), which is exactly this scope_key.
LEGACY_GEOCODE_SCOPE = "NG:Abia:Aba"

# Applied statement by statement. All idempotent, safe on every startup:
#   - fresh database: creates the scoped table; the migration steps no-op.
#   - old (address-only) table: adds `scope` (existing rows backfilled with
#     LEGACY_GEOCODE_SCOPE), then swaps the primary key to (scope, address).
_SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS geocode_cache (
        scope       TEXT NOT NULL,
        address     TEXT NOT NULL,
        latitude    DOUBLE PRECISION NOT NULL,
        longitude   DOUBLE PRECISION NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, address)
    )
    """,
    f"""
    ALTER TABLE geocode_cache
        ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT '{LEGACY_GEOCODE_SCOPE}'
    """,
    # The default only exists to backfill old rows. Drop it so a future
    # insert that forgets to pass a scope fails loudly instead of silently
    # landing in the Abia scope.
    "ALTER TABLE geocode_cache ALTER COLUMN scope DROP DEFAULT",
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_index i
            JOIN pg_attribute a
              ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
            WHERE i.indrelid = 'geocode_cache'::regclass
              AND i.indisprimary
              AND a.attname = 'scope'
        ) THEN
            ALTER TABLE geocode_cache DROP CONSTRAINT IF EXISTS geocode_cache_pkey;
            ALTER TABLE geocode_cache ADD PRIMARY KEY (scope, address);
        END IF;
    END
    $$
    """,
    """
    CREATE TABLE IF NOT EXISTS travel_time_cache (
        origin_lat   DOUBLE PRECISION NOT NULL,
        origin_lon   DOUBLE PRECISION NOT NULL,
        dest_lat     DOUBLE PRECISION NOT NULL,
        dest_lon     DOUBLE PRECISION NOT NULL,
        mode         TEXT NOT NULL,
        minutes      DOUBLE PRECISION NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (origin_lat, origin_lon, dest_lat, dest_lon, mode)
    )
    """,
)


class CachedDistanceService(DistanceService):

    def __init__(self, inner: DistanceService, database_url: str, coord_precision: int = 6, max_idle_seconds=180):
        self.inner = inner
        self.coord_precision = coord_precision
        self.max_idle_seconds = max_idle_seconds
        self._last_used = time.monotonic()

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

    @property
    def scope_key(self) -> str:
        """Geographic scope of the wrapped service; this is what geocode_cache is keyed on."""
        return getattr(self.inner, "scope_key", "default")

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
            for statement in _SCHEMA_STATEMENTS:
                cur.execute(statement)
        logger.info(
            "CachedDistanceService: schema ensured (geocode_cache scoped by (scope, address), "
            "travel_time_cache); this instance's scope=%s",
            self.scope_key,
        )

    def _reconnect_if_needed(self):
        idle_for = time.monotonic() - self._last_used
        if self._conn.closed or idle_for > self.max_idle_seconds:
            if not self._conn.closed:
                logger.info("CachedDistanceService: idle %.0fs, refreshing connection", idle_for)
                try:
                    self._conn.close()
                except Exception:
                    pass
            self._conn = self._connect()
        self._last_used = time.monotonic()

    def _execute(self, query, params, fetch=False, max_retries: int = 4, base_delay: float = 1.0):
        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                self._reconnect_if_needed()
                with self._conn.cursor() as cur:
                    cur.execute(query, params)
                    return cur.fetchone() if fetch else None
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
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
        scope = self.scope_key
        key = (address or "").strip()

        row = self._execute(
            "SELECT latitude, longitude FROM geocode_cache WHERE scope = %s AND address = %s",
            (scope, key),
            fetch=True,
        )

        if row is not None:
            self.geocode_db_hits += 1
            logger.debug("CachedDistanceService.geocode() DB hit for %r (scope=%s)", key, scope)
            return (row[0], row[1])

        # Miss — delegate to the real service (this is the billable call)
        self.geocode_api_calls += 1
        logger.debug(
            "CachedDistanceService.geocode() DB miss for %r (scope=%s), calling inner service",
            key, scope,
        )
        coords = self.inner.geocode(address, landmark_fallback=landmark_fallback)

        self._execute(
            """
            INSERT INTO geocode_cache (scope, address, latitude, longitude)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (scope, address) DO NOTHING
            """,
            (scope, key, coords[0], coords[1]),
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
            "CachedDistanceService summary (scope=%s): geocode %d API calls / %d DB hits, "
            "travel_time %d API calls / %d DB hits",
            self.scope_key,
            self.geocode_api_calls, self.geocode_db_hits,
            self.travel_time_api_calls, self.travel_time_db_hits,
        )