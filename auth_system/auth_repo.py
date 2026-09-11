"""
auth_repo.py

Raw-SQL data access for users and roles (psycopg2), mirroring the style of
utils/audit_log.py already in this codebase. Swap the connection helper for
your existing DB connection pool if you have one — this opens a short-lived
connection per call, which is fine at internal-tool scale.
"""

from contextlib import contextmanager

import psycopg2
import psycopg2.extras


@contextmanager
def _conn(database_url: str):
    conn = psycopg2.connect(database_url)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

def create_role(database_url: str, name: str, department: str, permissions: list[str]) -> dict:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO roles (name, department, permissions)
                VALUES (%s, %s, %s)
                RETURNING id, name, department, permissions
                """,
                (name, department, permissions),
            )
            return dict(cur.fetchone())


def list_roles(database_url: str) -> list[dict]:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, name, department, permissions FROM roles ORDER BY department, name")
            return [dict(r) for r in cur.fetchall()]


def get_role(database_url: str, role_id: int) -> dict | None:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, department, permissions FROM roles WHERE id = %s", (role_id,)
            )
            row = cur.fetchone()
            return dict(row) if row else None


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def create_user(
    database_url: str,
    email: str,
    full_name: str,
    hashed_password: str,
    department: str,
    role_id: int | None,
    is_super_admin: bool,
) -> dict:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO users (email, full_name, hashed_password, department, role_id, is_super_admin)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, email, full_name, department, role_id, is_super_admin, is_active, must_change_password
                """,
                (email, full_name, hashed_password, department, role_id, is_super_admin),
            )
            return dict(cur.fetchone())


def get_user_by_email(database_url: str, email: str) -> dict | None:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT u.id, u.email, u.full_name, u.hashed_password, u.department, u.role_id,
                       u.is_super_admin, u.is_active, u.must_change_password,
                       r.name AS role_name, r.permissions
                FROM users u
                LEFT JOIN roles r ON r.id = u.role_id
                WHERE u.email = %s
                """,
                (email,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def get_user_by_id(database_url: str, user_id: int) -> dict | None:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT u.id, u.email, u.full_name, u.department, u.role_id, u.is_super_admin,
                       u.is_active, u.must_change_password,
                       r.name AS role_name, r.permissions
                FROM users u
                LEFT JOIN roles r ON r.id = u.role_id
                WHERE u.id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def list_users(database_url: str) -> list[dict]:
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT u.id, u.email, u.full_name, u.department, u.role_id, u.is_super_admin,
                       u.is_active, u.must_change_password, r.name AS role_name
                FROM users u
                LEFT JOIN roles r ON r.id = u.role_id
                ORDER BY u.department, u.email
                """
            )
            return [dict(r) for r in cur.fetchall()]


def update_user(database_url: str, user_id: int, **fields) -> dict | None:
    """fields: any of full_name, department, role_id, is_active"""
    if not fields:
        return get_user_by_id(database_url, user_id)
    set_clause = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [user_id]
    with _conn(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"""
                UPDATE users SET {set_clause}
                WHERE id = %s
                RETURNING id, email, full_name, department, role_id, is_super_admin, is_active, must_change_password
                """,
                values,
            )
            row = cur.fetchone()
            return dict(row) if row else None


def set_password(database_url: str, user_id: int, hashed_password: str, must_change_password: bool) -> None:
    with _conn(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET hashed_password = %s, must_change_password = %s WHERE id = %s",
                (hashed_password, must_change_password, user_id),
            )


def touch_last_login(database_url: str, user_id: int) -> None:
    with _conn(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET last_login_at = now() WHERE id = %s", (user_id,))


def delete_user(database_url: str, user_id: int) -> bool:
    """Returns True if a row was deleted, False if no such user existed."""
    with _conn(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            return cur.rowcount > 0


def count_active_super_admins(database_url: str) -> int:
    with _conn(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM users WHERE is_super_admin = true AND is_active = true"
            )
            return cur.fetchone()[0]