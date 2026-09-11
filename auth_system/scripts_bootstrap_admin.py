"""
scripts_bootstrap_admin.py

Run once, after applying sql/001_auth_schema.sql, to create the first
super admin (you can't create the first user through /admin/users since
that endpoint itself requires a super admin).

Usage:
    DATABASE_URL=postgres://... python -m auth_system.scripts_bootstrap_admin \\
        you@example.com "Executive"
"""

import sys

from .auth_repo import create_user, get_user_by_email
from .security import generate_temp_password, hash_password


def main():
    import os

    if len(sys.argv) != 3:
        print("Usage: python -m auth_system.scripts_bootstrap_admin <email> <department>")
        sys.exit(1)

    email, department = sys.argv[1], sys.argv[2]
    database_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        print("DATABASE_URL (or SUPABASE_DB_URL) must be set.")
        sys.exit(1)

    if get_user_by_email(database_url, email):
        print(f"A user with email {email} already exists.")
        sys.exit(1)

    temp_password = generate_temp_password()
    user = create_user(
        database_url,
        email=email,
        hashed_password=hash_password(temp_password),
        department=department,
        role_id=None,
        is_super_admin=True,
    )
    print(f"Created super admin id={user['id']} email={email}")
    print(f"Temp password (share securely, not via this log): {temp_password}")


if __name__ == "__main__":
    main()
