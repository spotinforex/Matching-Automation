"""Postgres-backed audit logging for user-visible application actions."""

import json
import logging
from typing import Any

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

_AUDIT_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    action      TEXT NOT NULL,
    endpoint    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'success',
    actor_ip    INET,
    user_agent  TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Identity columns for the actor who performed the action. Added via
-- ADD COLUMN IF NOT EXISTS so this migrates existing tables in place the
-- next time the app starts, no manual SQL required.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_id INTEGER;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_email TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_name TEXT;

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON audit_log (actor_id);
"""


def ensure_audit_log_table(database_url: str | None) -> None:
    """Create (or migrate) the audit table when Postgres is configured.

    Audit logging must never prevent the matching application from starting.
    Connection and schema errors are therefore logged and intentionally ignored.
    """
    if not database_url:
        logger.info("Audit logging disabled: DATABASE_URL is not configured")
        return

    try:
        with psycopg2.connect(database_url, connect_timeout=10) as connection:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute(_AUDIT_SCHEMA)
        logger.info("Audit logging enabled: audit_log table ensured")
    except (psycopg2.Error, OSError):
        logger.exception("Could not initialize audit logging; continuing without it")


def log_action(
    database_url: str | None,
    *,
    action: str,
    endpoint: str,
    status: str = "success",
    actor_ip: str | None = None,
    user_agent: str | None = None,
    actor_id: int | None = None,
    actor_email: str | None = None,
    actor_name: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Record an action without allowing audit infrastructure to break a request."""
    if not database_url:
        return

    try:
        with psycopg2.connect(database_url, connect_timeout=10) as connection:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO audit_log
                        (action, endpoint, status, actor_ip, user_agent,
                         actor_id, actor_email, actor_name, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        action,
                        endpoint,
                        status,
                        actor_ip,
                        user_agent,
                        actor_id,
                        actor_email,
                        actor_name,
                        json.dumps(metadata or {}, default=str),
                    ),
                )
    except (psycopg2.Error, OSError, TypeError, ValueError):
        logger.exception("Could not write audit event %s", action)


def get_audit_logs(
    database_url: str | None,
    *,
    from_time: Any = None,
    to_time: Any = None,
    action: str | None = None,
    status: str | None = None,
    actor_id: int | None = None,
    actor_email: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Fetch audit events newest first, with optional filters and pagination."""
    if not database_url:
        raise RuntimeError("Audit logging is not configured")

    filters = []
    params: list[Any] = []
    if from_time is not None:
        filters.append("created_at >= %s")
        params.append(from_time)
    if to_time is not None:
        filters.append("created_at <= %s")
        params.append(to_time)
    if action:
        filters.append("action = %s")
        params.append(action)
    if status:
        filters.append("status = %s")
        params.append(status)
    if actor_id is not None:
        filters.append("actor_id = %s")
        params.append(actor_id)
    if actor_email:
        filters.append("actor_email = %s")
        params.append(actor_email)

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    try:
        with psycopg2.connect(database_url, connect_timeout=10) as connection:
            with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute(f"SELECT COUNT(*) AS total FROM audit_log {where_clause}", params)
                total_row = cursor.fetchone()
                total = total_row["total"] if total_row else 0

                cursor.execute(
                    f"""
                    SELECT id, action, endpoint, status, actor_ip::text AS actor_ip,
                           user_agent, actor_id, actor_email, actor_name, metadata, created_at
                    FROM audit_log
                    {where_clause}
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s OFFSET %s
                    """,
                    [*params, limit, offset],
                )
                return [dict(row) for row in cursor.fetchall()], total
    except (psycopg2.Error, OSError) as error:
        raise RuntimeError("Could not retrieve audit logs") from error