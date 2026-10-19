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
from app.models.user import UserORM
from app.schemas.auth import LoginRequest, LogoutResponse, TokenResponse, UserProfile

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
    )


# Shared dependencies are imported here for discoverability by downstream API modules.
__all__ = ["router", "require_permission", "require_role"]
