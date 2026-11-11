from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    AuthenticatedUser,
    create_access_token,
    create_refresh_token,
    decode_access_token,
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

logger = logging.getLogger(__name__)

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])
_security_scheme = HTTPBearer(auto_error=False)

# A fixed dummy hash keeps unknown usernames on the same password-verification path.
_DUMMY_PASSWORD_HASH = get_password_hash("not-a-real-user-password")


def _token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _revoke_user_refresh_tokens(
    db: Session,
    user_id: int,
    *,
    only_token_hash: str | None = None,
) -> None:
    """Revoke refresh tokens for a user.

    If only_token_hash is provided, only that token is revoked (device-scoped logout).
    Otherwise all active refresh tokens for the user are revoked.
    """
    stmt = (
        update(RefreshTokenORM)
        .where(
            RefreshTokenORM.user_id == user_id,
            RefreshTokenORM.revoked.is_(False),
        )
        .values(revoked=True)
    )
    if only_token_hash is not None:
        stmt = stmt.where(RefreshTokenORM.token_hash == only_token_hash)
    db.execute(stmt)


def _is_access_token_expired_error(exc: BaseException) -> bool:
    return isinstance(exc, jwt.ExpiredSignatureError)


def _is_access_token_invalid_error(exc: BaseException) -> bool:
    return isinstance(exc, jwt.PyJWTError) and not isinstance(exc, jwt.ExpiredSignatureError)


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

    access_token = create_access_token(
        subject=user.username,
        payload={"user_id": user.id},
    )
    refresh_token = create_refresh_token(
        subject=user.username,
        payload={"user_id": user.id},
    )

    # Audit + refresh-token persistence in one transaction.
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
    db.add(
        RefreshTokenORM(
            user_id=user.id,
            token_hash=_token_hash(refresh_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        claims = decode_refresh_token(payload.refresh_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    try:
        claim_user_id = int(claims["user_id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    token_hash = _token_hash(payload.refresh_token)
    stored = db.scalar(
        select(RefreshTokenORM).where(RefreshTokenORM.token_hash == token_hash).with_for_update()
    )
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    # Reuse detection: token is already revoked. No token family/session identifier exists
    # in the current schema, so this revokes all active refresh tokens for the account
    # as a defensive response to possible token theft (existing behavior/policy).
    if stored.revoked:
        try:
            _revoke_user_refresh_tokens(db, stored.user_id)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to revoke refresh tokens after reuse detection")
            raise
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    expires_at = _as_utc(stored.expires_at)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    if stored.user_id != claim_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    user = db.scalar(select(UserORM).where(UserORM.id == claim_user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is disabled or not found",
        )

    # Rotate: revoke current, issue a new pair in the same DB transaction.
    stored.revoked = True
    new_access = create_access_token(
        subject=user.username,
        payload={"user_id": user.id},
    )
    new_refresh = create_refresh_token(
        subject=user.username,
        payload={"user_id": user.id},
    )
    db.add(
        RefreshTokenORM(
            user_id=user.id,
            token_hash=_token_hash(new_refresh),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    payload: RefreshRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_security_scheme),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    claims: dict[str, object] | None = None
    if credentials is not None:
        try:
            claims = decode_access_token(credentials.credentials)
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            ) from exc

    if claims is None and payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    if claims is not None:
        # Validate/revoke the presented access token. Redis denylist failures are fail-closed
        # and must not be reported as a successful logout.
        try:
            await revoke_access_token(claims)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Unexpected error while revoking access token during logout")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable",
            ) from None

        try:
            raw_user_id = claims["user_id"]
            user_id = int(raw_user_id) if isinstance(raw_user_id, (int, str)) else 0
            if user_id <= 0:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            # Token claims were validated earlier; treat malformed user context as invalid token.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            ) from None

        # Revoke only the specified refresh token for this user (device-scoped). If no refresh
        # token is provided, the current device/session cannot be identified, so no refresh
        # tokens are revoked to avoid cross-device logout.
        # Use DELETE instead of marking revoked to avoid triggering the refresh endpoint's
        # reuse detection which would revoke all tokens for the account.
        only_hash = _token_hash(payload.refresh_token) if payload is not None else None
        if only_hash is not None:
            try:
                stmt = delete(RefreshTokenORM).where(
                    RefreshTokenORM.user_id == user_id,
                    RefreshTokenORM.token_hash == only_hash,
                )
                db.execute(stmt)
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Failed to revoke refresh token during logout")
                raise
        return LogoutResponse(message="Successfully logged out")

    # Path 2: refresh token only (no access token). Invalid/expired/malformed refresh token
    # is treated as idempotent logout success.
    assert payload is not None
    try:
        refresh_claims = decode_refresh_token(payload.refresh_token)
    except jwt.PyJWTError:
        return LogoutResponse(message="Successfully logged out")

    try:
        user_id = int(refresh_claims["user_id"])
    except (KeyError, TypeError, ValueError):
        return LogoutResponse(message="Successfully logged out")

    token_hash = _token_hash(payload.refresh_token)
    try:
        _revoke_user_refresh_tokens(db, user_id, only_token_hash=token_hash)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to revoke refresh token during refresh-only logout")
        raise
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
async def change_password(
    payload: ChangePasswordRequest,
    claims: dict[str, object] = Depends(get_current_token_claims),
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

    # Revoke the currently presented access token in Redis first (fail-closed). DB and Redis
    # operations are not atomic; if this fails, no password/refresh-token changes are committed.
    try:
        await revoke_access_token(claims)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error while revoking access token during password change")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from None

    try:
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

        # Password change invalidates all outstanding refresh sessions for this account.
        _revoke_user_refresh_tokens(db, user.id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return LogoutResponse(message="Password updated")


# Shared dependencies are re-exported for discoverability by downstream API modules.
__all__ = ["require_permission", "require_role", "router"]
