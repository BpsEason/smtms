from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from app.core import redis_client
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import (
    PermissionORM,
    RoleORM,
    RolePermissionORM,
    UserORM,
    UserRoleORM,
)
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: int
    username: str
    email: str | None
    is_active: bool
    roles: tuple[str, ...]
    permissions: frozenset[str]
    must_change_password: bool = False
    supplier_id: int | None = None


def normalize_permission_code(permission: str) -> str:
    return permission.removeprefix("seed:") if permission.startswith("seed:") else permission


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (TypeError, ValueError, UnicodeEncodeError):
        return False


def get_password_hash(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))
    return hashed.decode("ascii")


def create_access_token(
    subject: str | Any,
    payload: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    lifetime = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    claims: dict[str, Any] = {
        **(payload or {}),
        "sub": str(subject),
        "iat": now,
        "exp": now + lifetime,
        "jti": secrets.token_urlsafe(32),
    }
    return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.algorithm],
        options={"require": ["sub", "user_id", "iat", "exp", "jti"]},
    )


def get_current_token_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        claims = decode_access_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    token_id = claims.get("jti")
    if not isinstance(token_id, str) or not token_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        if redis_client.get_redis_client().exists(f"auth:revoked:{token_id}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc
    return claims


def revoke_access_token(claims: dict[str, Any]) -> None:
    token_id = claims.get("jti")
    expires_at = claims.get("exp")
    if not isinstance(token_id, str) or not isinstance(expires_at, (int, float)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    ttl = max(1, int(expires_at - datetime.now(timezone.utc).timestamp()))
    try:
        redis_client.get_redis_client().set(
            f"auth:revoked:{token_id}",
            "1",
            ex=ttl,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc


def get_current_user(
    claims: dict[str, Any] = Depends(get_current_token_claims),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    try:
        user_id = int(claims["user_id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    user = db.scalar(select(UserORM).where(UserORM.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is disabled or not found",
        )

    db.info["audit_actor_id"] = user.id

    role_names = tuple(
        db.scalars(
            select(RoleORM.name)
            .join(UserRoleORM, UserRoleORM.role_id == RoleORM.id)
            .where(UserRoleORM.user_id == user.id)
            .order_by(RoleORM.name)
        ).all()
    )
    permission_codes = frozenset(
        normalize_permission_code(code)
        for code in db.scalars(
            select(PermissionORM.code)
            .join(RolePermissionORM, RolePermissionORM.permission_id == PermissionORM.id)
            .join(UserRoleORM, UserRoleORM.role_id == RolePermissionORM.role_id)
            .where(UserRoleORM.user_id == user.id)
        ).all()
    )
    return AuthenticatedUser(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        roles=role_names,
        permissions=permission_codes,
        must_change_password=bool(user.must_change_password),
        supplier_id=user.supplier_id,
    )


def ensure_supplier_access(current_user: AuthenticatedUser, supplier_id: int) -> None:
    """Block supplier login accounts from reaching other suppliers' data.

    Internal accounts (``supplier_id is None``) are unaffected.
    """
    if current_user.supplier_id is not None and current_user.supplier_id != supplier_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _ensure_password_changed(current_user: AuthenticatedUser) -> None:
    if current_user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required before accessing this resource",
        )


def require_permission(*required_permissions: str):
    def dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        _ensure_password_changed(current_user)
        granted_permissions = {
            normalize_permission_code(permission) for permission in current_user.permissions
        }
        missing = set(required_permissions) - granted_permissions
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {sorted(missing)}",
            )
        return current_user

    return dependency


def require_any_permission(*required_permissions: str):
    def dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        _ensure_password_changed(current_user)
        granted_permissions = {
            normalize_permission_code(permission) for permission in current_user.permissions
        }
        if not set(required_permissions).intersection(granted_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {sorted(set(required_permissions))}",
            )
        return current_user

    return dependency


def require_role(*allowed_roles: str):
    def dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        _ensure_password_changed(current_user)
        if not set(allowed_roles).intersection(current_user.roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return current_user

    return dependency
