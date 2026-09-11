"""
security.py

Password hashing, JWT issuance/verification, and random temp-password
generation. Pure functions — no DB or FastAPI dependencies here.
"""

import os
import secrets
import string
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET is not set. Set it to a long random string before starting the app "
        "(e.g. `openssl rand -hex 32`). Do not hardcode a default in code."
    )
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "480"))  # 8h default


def _check_length(plain_password: str) -> bytes:
    encoded = plain_password.encode("utf-8")
    if len(encoded) > 72:
        # bcrypt hard-caps input at 72 bytes. Reject explicitly with a clear
        # message rather than letting bcrypt raise its own cryptic error.
        raise ValueError("Password is too long (max 72 bytes).")
    return encoded


def hash_password(plain_password: str) -> str:
    encoded = _check_length(plain_password)
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    encoded = _check_length(plain_password)
    return bcrypt.checkpw(encoded, hashed_password.encode("utf-8"))


def generate_temp_password(length: int = 12) -> str:
    """
    Cryptographically random temp password: mixed case, digits, a couple of
    symbols. Avoids ambiguous characters (0/O, 1/l/I) since a human may need
    to type it in during the forced first change.
    """
    alphabet = "".join(
        c for c in (string.ascii_letters + string.digits + "!@#$%^&*")
        if c not in "0O1lI"
    )
    return "".join(secrets.choice(alphabet) for _ in range(length))


def create_access_token(user_id: int, email: str, is_super_admin: bool) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "is_super_admin": is_super_admin,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError (expired, invalid signature, malformed, etc.) on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])