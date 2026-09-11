
import os
import sys

import psycopg2
from dotenv import load_dotenv

load_dotenv() 


def main():
    if len(sys.argv) != 2:
        print("Usage: python run_migration.py <path-to-sql-file>")
        sys.exit(1)

    sql_path = sys.argv[1]
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("Set DATABASE_URL first.")
        sys.exit(1)

    sql = """
        -- Auth schema for the matching-automation internal tool.
        -- Run this once against your Postgres/Supabase DATABASE_URL.

        CREATE TABLE IF NOT EXISTS roles (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL,            -- e.g. "Matching Analyst", "Auditor"
            department      TEXT NOT NULL,            -- e.g. "Operations", "M&E", "IT"
            permissions     TEXT[] NOT NULL DEFAULT '{}',
            -- allowed values live in application code: run_match, evaluate, audit_logs, endpoints_list
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (name, department)
        );

        CREATE TABLE IF NOT EXISTS users (
            id                  SERIAL PRIMARY KEY,
            email               TEXT NOT NULL UNIQUE,
            hashed_password     TEXT NOT NULL,
            department          TEXT NOT NULL,
            role_id             INTEGER REFERENCES roles(id) ON DELETE SET NULL,
            is_super_admin      BOOLEAN NOT NULL DEFAULT false,
            is_active           BOOLEAN NOT NULL DEFAULT true,
            must_change_password BOOLEAN NOT NULL DEFAULT true,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_login_at       TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

        -- Seed the first super admin manually after running this migration, e.g.:
        --   INSERT INTO users (email, hashed_password, department, is_super_admin, must_change_password)
        --   VALUES ('you@example.com', '<bcrypt hash>', 'Executive', true, true);
        -- Use security.hash_password("some-temp-password") to generate the hash, or
        -- run scripts/bootstrap_admin.py (created below) instead of doing this by hand.
        """

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print(f"Applied {sql_path} successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()