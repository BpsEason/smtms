from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    AuthenticatedUser,
    create_access_token,
    get_current_token_claims,
    get_current_user,
    get_password_hash,
    require_permission,
    require_role,
    revoke_access_token,
    verify_password,
)
from app.db.session import get_db
from app.models.audit import AuditLogORM
from app.models.user import UserORM
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutResponse,
    TokenResponse,
    UserProfile,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# A fixed dummy hash keeps unknown usernames on the same password-verification path.
_DUMMY_PASSWORD_HASH = get_password_hash("not-a-real-user-password")


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(UserORM).where(UserORM.username == payload.username))
    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    password_matches = verify_password(payload.password, password_hash)
    if user is None or not user.is_active or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    db.info["audit_actor_id"] = user.id
    db.add(
        AuditLogORM(
            actor_user_id=user.id,
            action="LOGIN",
            resource_type="users",
            resource_id=str(user.id),
            after_data={"username": user.username, "result": "success"},
        )
    )
    db.commit()

    token = create_access_token(
        subject=user.username,
        payload={"user_id": user.id},
    )
    return TokenResponse(access_token=token)


@router.post("/logout", response_model=LogoutResponse)
def logout(claims: dict = Depends(get_current_token_claims)) -> LogoutResponse:
    revoke_access_token(claims)
    return LogoutResponse(message="Successfully logged out")


@router.get("/me", response_model=UserProfile)
def me(current_user: AuthenticatedUser = Depends(get_current_user)) -> UserProfile:
    return UserProfile(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_active=current_user.is_active,
        roles=list(current_user.roles),
        permissions=sorted(current_user.permissions),
        must_change_password=current_user.must_change_password,
    )


@router.post("/change-password", response_model=LogoutResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> LogoutResponse:
    if len(payload.new_password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="new_password must be at most 72 UTF-8 bytes",
        )
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current password",
        )
    user = db.scalar(select(UserORM).where(UserORM.id == current_user.id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is disabled or not found",
        )
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.password_hash = get_password_hash(payload.new_password)
    user.must_change_password = False
    db.commit()
    return LogoutResponse(message="Password updated")


# Shared dependencies are imported here for discoverability by downstream API modules.
__all__ = ["router", "require_permission", "require_role"]
