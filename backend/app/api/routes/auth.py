import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    AuthenticatedUser,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
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
from app.models.user import RefreshTokenORM, UserORM
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutResponse,
    RefreshRequest,
    TokenResponse,
    UserProfile,
)

settings = get_settings()

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
    refresh_token = create_refresh_token(
        subject=user.username,
        payload={"user_id": user.id},
    )
    db.add(
        RefreshTokenORM(
            user_id=user.id,
            token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.commit()
    return TokenResponse(access_token=token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        claims = decode_refresh_token(payload.refresh_token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    token_hash = hashlib.sha256(payload.refresh_token.encode()).hexdigest()
    stored = db.scalar(
        select(RefreshTokenORM)
        .where(RefreshTokenORM.token_hash == token_hash)
        .with_for_update()
    )
    if stored is None or stored.revoked or stored.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    if stored.user_id != int(claims["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    user = db.scalar(select(UserORM).where(UserORM.id == int(claims["user_id"])))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is disabled or not found",
        )

    # rotate
    stored.revoked = True
    new_access = create_access_token(subject=user.username, payload={"user_id": user.id})
    new_refresh = create_refresh_token(subject=user.username, payload={"user_id": user.id})
    db.add(
        RefreshTokenORM(
            user_id=user.id,
            token_hash=hashlib.sha256(new_refresh.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    claims: dict = Depends(get_current_token_claims),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    await revoke_access_token(claims)
    try:
        user_id = int(claims["user_id"])
    except (KeyError, TypeError, ValueError):
        return LogoutResponse(message="Successfully logged out")
    db.query(RefreshTokenORM).filter(
        RefreshTokenORM.user_id == user_id,
        RefreshTokenORM.revoked.is_(False),
    ).update({"revoked": True})
    db.commit()
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
__all__ = ["require_permission", "require_role", "router"]
