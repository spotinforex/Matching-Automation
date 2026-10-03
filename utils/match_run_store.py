"""
utils/match_run_store.py

Persists each /match/run invocation — including its full matches, waitlist,
and dropped_mcps payload — to Postgres, so past runs can be listed and
reopened later without re-running the matcher.

This is deliberately a separate table/module from utils/audit_log.py rather
than piggybacking on the audit log: the audit log is an event trail
(who did what, when, pass/fail), while this is query-able result data people
will actually want to reopen — full matches/waitlist payloads, with its own
natural primary key (the run id) and its own list/detail access pattern.

Uses psycopg2 directly against DATABASE_URL, same as the rest of the app's
Postgres usage. If utils/audit_log.py already exposes a shared connection
helper, swap the psycopg2.connect(...) calls below for that instead of
connecting twice per request.
"""

import json
import logging
from typing import Any

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)


def ensure_match_runs_table(database_url: str) -> None:
    """
    Creates the match_runs table (and a supporting index) if it doesn't
    already exist. Safe to call on every app startup, same as
    ensure_audit_log_table().

    Raises RuntimeError (not the raw psycopg2 exception) on failure, so
    callers don't need to know this is backed by psycopg2. Intentionally
    NOT caught here and swallowed — this runs once at startup, right next
    to ensure_audit_log_table(), and the app should fail to start rather
    than run with match-run persistence silently broken.
    """
    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS match_runs (
                        id BIGSERIAL PRIMARY KEY,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        actor_id INTEGER,
                        actor_email TEXT,
                        actor_name TEXT,
                        hop_limit INTEGER NOT NULL,
                        match_cap INTEGER,
                        shortlist_size INTEGER NOT NULL,
                        matched_count INTEGER NOT NULL,
                        waitlisted_count INTEGER NOT NULL,
                        dropped_mcp_count INTEGER NOT NULL,
                        matches JSONB NOT NULL,
                        waitlist JSONB NOT NULL,
                        dropped_mcps JSONB NOT NULL
                    )
                    """
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_match_runs_created_at "
                    "ON match_runs (created_at DESC)"
                )
            conn.commit()
    except psycopg2.Error as e:
        logger.exception("match_run_store: failed to ensure match_runs table exists")
        raise RuntimeError(f"Could not set up match_runs table: {e}") from e

    logger.info("match_run_store: match_runs table ready")


def save_match_run(
    database_url: str,
    *,
    actor_id: int | None,
    actor_email: str | None,
    actor_name: str | None,
    hop_limit: int,
    match_cap: int | None,
    shortlist_size: int,
    matches: list[dict[str, Any]],
    waitlist: list[dict[str, Any]],
    dropped_mcps: list[dict[str, Any]],
) -> int:
    """
    Stores one full match run (matches + waitlist + dropped_mcps, plus the
    parameters it was run with and who ran it) and returns the new row's id.
    Call this right after matcher.run() returns, before building the
    MatchRunResponse the endpoint returns.

    Raises RuntimeError (not the raw psycopg2 exception) on failure. Callers
    that would otherwise lose an already-successful match result over a
    persistence failure should catch this and degrade gracefully — see how
    /match/run in main.py handles it.
    """
    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO match_runs (
                        actor_id, actor_email, actor_name,
                        hop_limit, match_cap, shortlist_size,
                        matched_count, waitlisted_count, dropped_mcp_count,
                        matches, waitlist, dropped_mcps
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        actor_id, actor_email, actor_name,
                        hop_limit, match_cap, shortlist_size,
                        len(matches), len(waitlist), len(dropped_mcps),
                        json.dumps(matches), json.dumps(waitlist), json.dumps(dropped_mcps),
                    ),
                )
                run_id = cur.fetchone()[0]
            conn.commit()
    except psycopg2.Error as e:
        logger.exception("match_run_store: failed to save match run")
        raise RuntimeError(f"Could not save match run: {e}") from e

    logger.info(
        "match_run_store: saved run id=%s (%d matched, %d waitlisted, %d mcp(s) dropped)",
        run_id, len(matches), len(waitlist), len(dropped_mcps),
    )
    return run_id


def list_match_runs(
    database_url: str,
    limit: int = 50,
    offset: int = 0,
    actor_id: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """
    Returns (rows, total) for a paginated list view. Rows are summaries only
    — no matches/waitlist/dropped_mcps payload — so listing stays cheap even
    once there are many runs with large payloads. Use get_match_run() for
    the full record of one specific run.

    actor_id: pass the caller's own user id to restrict results to runs
    they triggered (ordinary users); pass None for an unfiltered, all-users
    listing (super admins). This filtering happens here, in SQL, rather than
    in the endpoint, so there's one place — not one per caller — that
    decides what "my runs" means.

    Raises RuntimeError (not the raw psycopg2 exception) on failure.
    """
    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                if actor_id is None:
                    cur.execute(
                        """
                        SELECT id, created_at, actor_id, actor_email, actor_name,
                               hop_limit, match_cap, shortlist_size,
                               matched_count, waitlisted_count, dropped_mcp_count
                        FROM match_runs
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s
                        """,
                        (limit, offset),
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, created_at, actor_id, actor_email, actor_name,
                               hop_limit, match_cap, shortlist_size,
                               matched_count, waitlisted_count, dropped_mcp_count
                        FROM match_runs
                        WHERE actor_id = %s
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s
                        """,
                        (actor_id, limit, offset),
                    )
                rows = [dict(r) for r in cur.fetchall()]

                if actor_id is None:
                    cur.execute("SELECT COUNT(*) AS total FROM match_runs")
                else:
                    cur.execute(
                        "SELECT COUNT(*) AS total FROM match_runs WHERE actor_id = %s",
                        (actor_id,),
                    )
                total = cur.fetchone()["total"]
    except psycopg2.Error as e:
        logger.exception("match_run_store: failed to list match runs")
        raise RuntimeError(f"Could not list match runs: {e}") from e

    return rows, total


def get_match_run(
    database_url: str,
    run_id: int,
    actor_id: int | None = None,
) -> dict[str, Any] | None:
    """
    Full record for one run, including matches/waitlist/dropped_mcps.
    Returns None if no run with that id exists.

    actor_id: pass the caller's own user id to additionally require that
    they own the run (ordinary users) — a run that exists but belongs to
    someone else is indistinguishable from a run that doesn't exist, which
    is what lets the endpoint return a plain 404 instead of a 403 that would
    confirm other users' run ids exist. Pass None for no ownership check
    (super admins).

    Raises RuntimeError (not the raw psycopg2 exception) on failure — a
    genuine DB/connection error, distinct from the "no matching row" case,
    which returns None rather than raising.
    """
    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                if actor_id is None:
                    cur.execute("SELECT * FROM match_runs WHERE id = %s", (run_id,))
                else:
                    cur.execute(
                        "SELECT * FROM match_runs WHERE id = %s AND actor_id = %s",
                        (run_id, actor_id),
                    )
                row = cur.fetchone()
    except psycopg2.Error as e:
        logger.exception("match_run_store: failed to fetch match run id=%s", run_id)
        raise RuntimeError(f"Could not fetch match run {run_id}: {e}") from e

    return dict(row) if row else None