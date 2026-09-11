from pydantic import BaseModel, EmailStr, Field

VALID_PERMISSIONS = {"run_match", "evaluate", "audit_logs", "endpoints_list"}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


class MeResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    department: str
    role: str | None
    permissions: list[str]
    is_super_admin: bool
    must_change_password: bool


class RoleCreateRequest(BaseModel):
    name: str
    department: str
    permissions: list[str]

    def validate_permissions(self):
        bad = set(self.permissions) - VALID_PERMISSIONS
        if bad:
            raise ValueError(f"Unknown permissions: {sorted(bad)}. Valid: {sorted(VALID_PERMISSIONS)}")


class RoleResponse(BaseModel):
    id: int
    name: str
    department: str
    permissions: list[str]


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    department: str
    role_id: int | None = None
    is_super_admin: bool = False


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    department: str
    role_id: int | None
    is_super_admin: bool
    is_active: bool
    must_change_password: bool


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    department: str | None = None
    role_id: int | None = None
    is_active: bool | None = None