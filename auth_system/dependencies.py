"""
dependencies.py

FastAPI dependencies for authentication and permission checks. Import
`get_current_user` and `require_permission` into your routers/main.py.

Usage:
    @app.post("/match/run", dependencies=[Depends(require_permission("run_match"))])
    def run_match(...): ...

    @app.get("/audit/logs", dependencies=[Depends(require_permission("audit_logs"))])
    def read_audit_logs(...): ...
"""

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import auth_repo
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_database_url(request: Request) -> str:
    # Reuses the same DATABASE_URL the rest of the app already resolved in main.py.
    database_url = getattr(request.app.state, "database_url", None)
    if not database_url:
        raise HTTPException(500, "DATABASE_URL is not configured for this app.")
    return database_url


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(401, "Missing bearer token")

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired — please log in again")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")

    database_url = get_database_url(request)
    user = auth_repo.get_user_by_id(database_url, int(payload["sub"]))
    if user is None or not user["is_active"]:
        raise HTTPException(401, "User not found or deactivated")

    return user


def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user["is_super_admin"]:
        raise HTTPException(403, "Super admin access required")
    return user


def require_permission(scope: str):
    """
    Returns a dependency that allows the request if the user is a super
    admin OR their role includes `scope` in its permissions array.
    """

    def _check(user: dict = Depends(get_current_user)) -> dict:
        if user["is_super_admin"]:
            return user
        permissions = user.get("permissions") or []
        if scope not in permissions:
            raise HTTPException(403, f"Missing permission: {scope}")
        return user

    return _check
