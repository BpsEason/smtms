from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None = None
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=72)


class LogoutResponse(BaseModel):
    message: str


class PermissionSummary(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)


class RoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def reject_null_name(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class RoleSummary(BaseModel):
    id: int
    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)
    user_count: int = 0
    is_system: bool = False


class RolePermissionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    permission_ids: list[int] = Field(default_factory=list)


class UserSummary(BaseModel):
    id: int
    username: str
    email: str | None = None
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)


class InternalUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=72)
    email: EmailStr | None = None
    role_ids: list[int] = Field(default_factory=list)


class UserRolesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_ids: list[int] = Field(default_factory=list)
