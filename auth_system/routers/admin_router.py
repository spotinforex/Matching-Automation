import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import auth_repo
from ..dependencies import get_database_url, require_super_admin
from ..email_service import send_temp_password_email
from ..schemas_auth import (
    RoleCreateRequest,
    RoleResponse,
    UserCreateRequest,
    UserResponse,
    UserUpdateRequest,
    VALID_PERMISSIONS,
)
from ..security import generate_temp_password, hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_super_admin)])


# ---------------------------------------------------------------------------
# Roles — named bundles of the four permission scopes, scoped to a department
# ---------------------------------------------------------------------------

@router.post("/roles", response_model=RoleResponse)
def create_role(payload: RoleCreateRequest, request: Request):
    bad = set(payload.permissions) - VALID_PERMISSIONS
    if bad:
        raise HTTPException(400, f"Unknown permissions: {sorted(bad)}. Valid: {sorted(VALID_PERMISSIONS)}")

    database_url = get_database_url(request)
    role = auth_repo.create_role(database_url, payload.name, payload.department, payload.permissions)
    return RoleResponse(**role)


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(request: Request):
    database_url = get_database_url(request)
    return [RoleResponse(**r) for r in auth_repo.list_roles(database_url)]


# ---------------------------------------------------------------------------
# Users — super admin creates users, assigns department + role, and the
# system emails a generated temp password.
# ---------------------------------------------------------------------------

@router.post("/users", response_model=UserResponse)
def create_user(payload: UserCreateRequest, request: Request):
    database_url = get_database_url(request)

    if auth_repo.get_user_by_email(database_url, payload.email):
        raise HTTPException(409, "A user with this email already exists")

    if payload.role_id is not None and auth_repo.get_role(database_url, payload.role_id) is None:
        raise HTTPException(400, f"No role with id {payload.role_id}")

    temp_password = generate_temp_password()
    user = auth_repo.create_user(
        database_url,
        email=payload.email,
        hashed_password=hash_password(temp_password),
        department=payload.department,
        role_id=payload.role_id,
        is_super_admin=payload.is_super_admin,
    )

    try:
        send_temp_password_email(payload.email, temp_password)
    except Exception:
        # User row is already committed. Don't silently swallow this — the
        # admin needs to know they must hand the password over another way.
        logger.exception("Failed to email temp password to %s", payload.email)
        raise HTTPException(
            201,
            f"User created (id={user['id']}) but the password email failed to send. "
            "Deliver the temp password to them manually or retry via a password reset.",
        )

    return UserResponse(**user)


@router.get("/users", response_model=list[UserResponse])
def list_users(request: Request):
    database_url = get_database_url(request)
    return [
        UserResponse(
            id=u["id"], email=u["email"], department=u["department"], role_id=u["role_id"],
            is_super_admin=u["is_super_admin"], is_active=u["is_active"],
            must_change_password=u["must_change_password"],
        )
        for u in auth_repo.list_users(database_url)
    ]


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, payload: UserUpdateRequest, request: Request):
    database_url = get_database_url(request)

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "role_id" in fields and auth_repo.get_role(database_url, fields["role_id"]) is None:
        raise HTTPException(400, f"No role with id {fields['role_id']}")

    updated = auth_repo.update_user(database_url, user_id, **fields)
    if updated is None:
        raise HTTPException(404, "No such user")
    return UserResponse(**updated)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, current_admin: dict = Depends(require_super_admin)):
    database_url = get_database_url(request)

    target = auth_repo.get_user_by_id(database_url, user_id)
    if target is None:
        raise HTTPException(404, "No such user")

    if target["id"] == current_admin["id"]:
        raise HTTPException(400, "You can't delete your own account.")

    if target["is_super_admin"] and target["is_active"] and auth_repo.count_active_super_admins(database_url) <= 1:
        raise HTTPException(400, "Can't delete the last active super admin.")

    auth_repo.delete_user(database_url, user_id)
    return None