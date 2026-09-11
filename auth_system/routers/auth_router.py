from fastapi import APIRouter, Depends, HTTPException, Request

from .. import auth_repo
from ..dependencies import get_current_user, get_database_url
from ..schemas_auth import ChangePasswordRequest, LoginRequest, LoginResponse, MeResponse
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request):
    database_url = get_database_url(request)
    user = auth_repo.get_user_by_email(database_url, payload.email)

    # Same error for "no such user" and "wrong password" — don't leak which
    # part was wrong.
    if user is None or not user["is_active"] or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(401, "Incorrect email or password")

    auth_repo.touch_last_login(database_url, user["id"])
    token = create_access_token(user["id"], user["email"], user["is_super_admin"])
    return LoginResponse(access_token=token, must_change_password=user["must_change_password"])


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database_url = get_database_url(request)
    full_user = auth_repo.get_user_by_email(database_url, user["email"])  # need hashed_password
    if not verify_password(payload.current_password, full_user["hashed_password"]):
        raise HTTPException(401, "Current password is incorrect")

    auth_repo.set_password(
        database_url,
        user["id"],
        hash_password(payload.new_password),
        must_change_password=False,
    )
    return {"status": "password updated"}


@router.get("/me", response_model=MeResponse)
def me(user: dict = Depends(get_current_user)):
    return MeResponse(
        id=user["id"],
        email=user["email"],
        full_name=user.get("full_name"),
        department=user["department"],
        role=user.get("role_name"),
        permissions=user.get("permissions") or [],
        is_super_admin=user["is_super_admin"],
        must_change_password=user["must_change_password"],
    )