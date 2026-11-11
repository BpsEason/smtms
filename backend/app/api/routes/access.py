"""Role, permission, and internal-user access management.

Every endpoint requires the existing ``users:manage`` permission (the only
management-level grant in the seed data). Authorization is enforced server-side
on each request; the JWT only carries the user id, so role and permission
changes resolve from the database on the very next request.

Removing management access (role permission edits, user role assignment and
role deletion) is serialized by a MySQL advisory lock and the "at least one
manager" check is read with ``FOR UPDATE``, so two concurrent requests cannot
each drop a different manager and leave the system without any administrator.
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import (
    AuthenticatedUser,
    get_password_hash,
    normalize_permission_code,
    require_permission,
)
from app.db.session import get_db
from app.models.user import (
    PermissionORM,
    RoleORM,
    RolePermissionORM,
    UserORM,
    UserRoleORM,
)
from app.schemas.auth import (
    InternalUserCreate,
    InternalUserUpdate,
    PermissionSummary,
    RoleCreate,
    RolePermissionUpdate,
    RoleSummary,
    RoleUpdate,
    UserRolesUpdate,
    UserSummary,
)
from app.services.supplier_import import (
    SUPPLIER_ROLE_NAME,
    SUPPLIER_ROLE_PERMISSION,
)

router = APIRouter(tags=["access-control"])

MANAGE_PERMISSION = "users:manage"
MANAGE_LOCK_NAME = "smtms:access_control:users_manage"
MANAGE_LOCK_TIMEOUT_SECONDS = 10


def _role_or_404(db: Session, role_id: int) -> RoleORM:
    role = db.get(RoleORM, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


def _role_permission_codes_batch(db: Session, role_ids: list[int]) -> dict[int, list[str]]:
    if not role_ids:
        return {}
    rows = db.execute(
        select(RolePermissionORM.role_id, PermissionORM.code)
        .join(PermissionORM, PermissionORM.id == RolePermissionORM.permission_id)
        .where(RolePermissionORM.role_id.in_(role_ids))
    ).all()
    result: dict[int, list[str]] = {role_id: [] for role_id in role_ids}
    for role_id, code in rows:
        result[role_id].append(normalize_permission_code(code))
    for role_id in result:
        result[role_id] = sorted(set(result[role_id]))
    return result


def _role_user_counts_batch(db: Session, role_ids: list[int]) -> dict[int, int]:
    if not role_ids:
        return {}
    rows = db.execute(
        select(UserRoleORM.role_id, func.count(UserRoleORM.user_id))
        .where(UserRoleORM.role_id.in_(role_ids))
        .group_by(UserRoleORM.role_id)
    ).all()
    result = dict.fromkeys(role_ids, 0)
    for role_id, count in rows:
        result[role_id] = count
    return result


def _user_roles_batch(db: Session, user_ids: list[int]) -> dict[int, list[str]]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(UserRoleORM.user_id, RoleORM.name)
        .join(RoleORM, RoleORM.id == UserRoleORM.role_id)
        .where(UserRoleORM.user_id.in_(user_ids))
        .order_by(RoleORM.name)
    ).all()
    result: dict[int, list[str]] = {user_id: [] for user_id in user_ids}
    for user_id, name in rows:
        result[user_id].append(name)
    return result


def _role_summary(
    db: Session,
    role: RoleORM,
    permissions_map: dict[int, list[str]],
    user_counts_map: dict[int, int],
) -> RoleSummary:
    return RoleSummary(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=permissions_map.get(role.id, []),
        user_count=user_counts_map.get(role.id, 0),
        is_system=role.name == SUPPLIER_ROLE_NAME,
    )


def _user_summary(db: Session, user: UserORM, roles_map: dict[int, list[str]]) -> UserSummary:
    return UserSummary(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        roles=roles_map.get(user.id, []),
    )


def _management_grants_statement():
    """Query for active internal users that hold ``users:manage``.

    ``FOR UPDATE`` turns this into a MySQL current read, so the guard observes
    the latest committed rows instead of the transaction's older snapshot.
    """
    return (
        select(UserORM.id, PermissionORM.code)
        .join(UserRoleORM, UserRoleORM.user_id == UserORM.id)
        .join(RolePermissionORM, RolePermissionORM.role_id == UserRoleORM.role_id)
        .join(PermissionORM, PermissionORM.id == RolePermissionORM.permission_id)
        .where(UserORM.is_active.is_(True), UserORM.supplier_id.is_(None))
        .with_for_update()
    )


def _management_grants(db: Session) -> set[int]:
    """Ids of active internal users that currently hold ``users:manage``."""
    rows = cast(Sequence[tuple[int, str]], db.execute(_management_grants_statement()).all())
    return {
        user_id for user_id, code in rows if normalize_permission_code(code) == MANAGE_PERMISSION
    }


@contextmanager
def _management_mutex(db: Session) -> Iterator[Connection | None]:
    """Serialize management writes so the last-manager check cannot race.

    MySQL (the production engine) uses a named advisory lock: the invariant
    spans rows that concurrent transactions insert and delete, so locking the
    matched rows alone cannot prevent a lost update. The lock is connection
    scoped and therefore released explicitly. Other dialects (the test suite
    runs on SQLite) have no advisory lock and keep the same code path.

    GET_LOCK / RELEASE_LOCK must run on the same physical connection. The
    underlying connection is acquired once here so commit/rollback inside the
    guarded block do not swap it out while the advisory lock is held.
    The connection is yielded so the caller can commit on it directly, avoiding
    Session.commit() which would close the connection before RELEASE_LOCK runs.
    """
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "mysql":
        yield None
        return

    conn = db.connection()
    acquired = conn.execute(
        text("SELECT GET_LOCK(:name, :timeout)"),
        {"name": MANAGE_LOCK_NAME, "timeout": MANAGE_LOCK_TIMEOUT_SECONDS},
    ).scalar()
    if acquired != 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="其他權限管理操作正在進行中，請稍後再試。",
        )
    try:
        yield conn
    finally:
        # Advisory locks are connection-scoped; RELEASE_LOCK must always run on
        # the same connection and must not persist/alter business transactions.
        try:
            conn.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": MANAGE_LOCK_NAME})
        finally:
            if conn.in_transaction():
                conn.rollback()


def _commit_keeping_one_manager(db: Session) -> None:
    """Persist pending changes, refusing to remove the last access manager.

    The lock, the check and the commit share one transaction boundary: pending
    writes are flushed inside the mutex and the manager set is re-read as a
    current read. A refusal rolls the whole change back. Success commits once.
    """
    with _management_mutex(db) as conn:
        db.flush()
        if not _management_grants(db):
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="操作會移除最後一位具備使用者管理權限的管理員，已拒絕。",
            )
        if conn is not None:
            # Commit on the connection directly to avoid Session.commit() closing
            # the connection before the mutex's finally block runs RELEASE_LOCK.
            conn.commit()
        else:
            db.commit()


def _integrity_conflict_detail(exc: IntegrityError) -> str:
    """Map DB integrity failures by actual constraint/index name when known."""
    parts: list[str] = []
    orig = getattr(exc, "orig", None)
    diag = getattr(orig, "diag", None) if orig is not None else None
    for candidate in (
        getattr(diag, "constraint_name", None) if diag is not None else None,
        getattr(diag, "column_name", None) if diag is not None else None,
        getattr(orig, "args", None),
        orig,
        exc,
    ):
        if candidate is None:
            continue
        if isinstance(candidate, (tuple, list)):
            parts.extend(str(item) for item in candidate if item is not None)
        else:
            parts.append(str(candidate))
    raw = " ".join(parts)

    constraint_match = re.search(
        r"(?:for key ['\"](?P<key>[^'\"]+)['\"]"
        r"|constraint(?: failed)?[: ]['\"]?(?P<constraint>[A-Za-z0-9_.:-]+)"
        r"|unique constraint ['\"](?P<unique>[^'\"]+)['\"]"
        r"|duplicate key name ['\"](?P<dup>[^'\"]+)['\"])",
        raw,
        flags=re.IGNORECASE,
    )
    identifier = ""
    if constraint_match:
        identifier = next(
            (value for value in constraint_match.groupdict().values() if value), ""
        ).lower()

    haystack = f"{identifier} {raw}".lower()
    if any(token in haystack for token in ("email", "uq_users_email", "ix_users_email")):
        if "email" in identifier or "uq_users_email" in haystack or "users.email" in haystack:
            return "Email already exists"
    if any(
        token in identifier or token in haystack
        for token in ("username", "uq_users_username", "ix_users_username")
    ):
        if (
            "username" in identifier
            or "uq_users_username" in haystack
            or "users.username" in haystack
        ):
            return "Username already exists"
    return "資料衝突，請檢查輸入內容。"


@router.get("/permissions", response_model=list[PermissionSummary])
def list_permissions(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> list[PermissionSummary]:
    permissions = db.scalars(select(PermissionORM).order_by(PermissionORM.code)).all()
    return [
        PermissionSummary(
            id=permission.id,
            code=normalize_permission_code(permission.code),
            name=permission.name,
            description=permission.description,
        )
        for permission in permissions
    ]


@router.get("/roles", response_model=list[RoleSummary])
def list_roles(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> list[RoleSummary]:
    roles = db.scalars(select(RoleORM).order_by(RoleORM.name)).all()
    role_ids = [role.id for role in roles]
    permissions_map = _role_permission_codes_batch(db, role_ids)
    user_counts_map = _role_user_counts_batch(db, role_ids)
    return [_role_summary(db, role, permissions_map, user_counts_map) for role in roles]


@router.post("/roles", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> RoleSummary:
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Role name cannot be blank",
        )
    if db.scalar(select(RoleORM.id).where(RoleORM.name == name)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role name already exists",
        )
    role = RoleORM(name=name, description=payload.description)
    db.add(role)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role name already exists",
        ) from exc
    db.refresh(role)
    permissions_map = _role_permission_codes_batch(db, [role.id])
    user_counts_map = _role_user_counts_batch(db, [role.id])
    return _role_summary(db, role, permissions_map, user_counts_map)


@router.patch("/roles/{role_id}", response_model=RoleSummary)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> RoleSummary:
    role = _role_or_404(db, role_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        new_name = changes["name"].strip()
        if not new_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Role name cannot be blank",
            )
        if role.name == SUPPLIER_ROLE_NAME and new_name != role.name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="系統的供應商入口角色不可重新命名。",
            )
        if role.name != SUPPLIER_ROLE_NAME and new_name == SUPPLIER_ROLE_NAME:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="一般角色不可改名為系統保留的供應商入口角色名稱。",
            )
        if new_name != role.name and db.scalar(
            select(RoleORM.id).where(RoleORM.name == new_name, RoleORM.id != role.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Role name already exists",
            )
        role.name = new_name
    if "description" in changes:
        role.description = changes["description"]
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role name already exists",
        ) from exc
    db.refresh(role)
    permissions_map = _role_permission_codes_batch(db, [role.id])
    user_counts_map = _role_user_counts_batch(db, [role.id])
    return _role_summary(db, role, permissions_map, user_counts_map)


@router.put("/roles/{role_id}/permissions", response_model=RoleSummary)
def set_role_permissions(
    role_id: int,
    payload: RolePermissionUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> RoleSummary:
    role = _role_or_404(db, role_id)
    permission_ids = set(payload.permission_ids)
    permissions = (
        db.scalars(select(PermissionORM).where(PermissionORM.id.in_(permission_ids))).all()
        if permission_ids
        else []
    )
    if len(permissions) != len(permission_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found",
        )
    codes = {normalize_permission_code(permission.code) for permission in permissions}
    if role.name == SUPPLIER_ROLE_NAME and codes - {SUPPLIER_ROLE_PERMISSION}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="供應商入口角色僅能擁有供應商讀取權限。",
        )

    existing = {
        link.permission_id: link
        for link in db.scalars(
            select(RolePermissionORM).where(RolePermissionORM.role_id == role.id)
        ).all()
    }
    for permission_id, link in existing.items():
        if permission_id not in permission_ids:
            db.delete(link)
    for permission_id in permission_ids - set(existing):
        db.add(RolePermissionORM(role_id=role.id, permission_id=permission_id))

    _commit_keeping_one_manager(db)
    permissions_map = _role_permission_codes_batch(db, [role.id])
    user_counts_map = _role_user_counts_batch(db, [role.id])
    return _role_summary(db, role, permissions_map, user_counts_map)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> Response:
    role = _role_or_404(db, role_id)
    if role.name == SUPPLIER_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="系統的供應商入口角色不可刪除。",
        )
    user_counts_map = _role_user_counts_batch(db, [role.id])
    if user_counts_map.get(role.id, 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role is still assigned to users",
        )
    db.delete(role)
    _commit_keeping_one_manager(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[UserSummary])
def list_internal_users(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> list[UserSummary]:
    users = db.scalars(
        select(UserORM).where(UserORM.supplier_id.is_(None)).order_by(UserORM.username)
    ).all()
    user_ids = [user.id for user in users]
    roles_map = _user_roles_batch(db, user_ids)
    return [_user_summary(db, user, roles_map) for user in users]


@router.post("/users", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
def create_internal_user(
    payload: InternalUserCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> UserSummary:
    username = _validate_internal_username(payload.username)
    _validate_internal_password(payload.password)
    if db.scalar(select(UserORM.id).where(UserORM.username == username)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    roles = _resolve_assignable_roles(db, payload.role_ids)

    user = UserORM(
        username=username,
        email=str(payload.email) if payload.email is not None else None,
        password_hash=get_password_hash(payload.password),
        is_active=True,
        supplier_id=None,
        must_change_password=False,
    )
    db.add(user)
    try:
        db.flush()
        db.add_all(UserRoleORM(user_id=user.id, role_id=role.id) for role in roles)
        _commit_keeping_one_manager(db)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_integrity_conflict_detail(exc),
        ) from exc
    db.refresh(user)
    roles_map = _user_roles_batch(db, [user.id])
    return _user_summary(db, user, roles_map)


def _validate_internal_username(username: str) -> str:
    value = username.strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="帳號僅能使用英文字母、數字、句點、底線及連字號。",
        )
    return value


def _validate_internal_password(password: str) -> None:
    if password == "":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="password cannot be empty",
        )
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="password must be at most 72 UTF-8 bytes",
        )


def _get_internal_user_or_404(db: Session, user_id: int) -> UserORM:
    user = db.get(UserORM, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.supplier_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="供應商入口帳號不可指派內部角色。",
        )
    return user


def _resolve_assignable_roles(db: Session, role_ids: list[int]) -> list[RoleORM]:
    normalized_ids = set(role_ids)
    roles = (
        db.scalars(select(RoleORM).where(RoleORM.id.in_(normalized_ids))).all()
        if normalized_ids
        else []
    )
    if len(roles) != len(normalized_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if any(role.name == SUPPLIER_ROLE_NAME for role in roles):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="供應商入口角色不可指派給內部使用者。",
        )
    return list(roles)


def _replace_user_roles(db: Session, user: UserORM, roles: list[RoleORM]) -> None:
    role_ids = {role.id for role in roles}
    existing = {
        link.role_id: link
        for link in db.scalars(select(UserRoleORM).where(UserRoleORM.user_id == user.id)).all()
    }
    for role_id, link in existing.items():
        if role_id not in role_ids:
            db.delete(link)
    for role_id in role_ids - set(existing):
        db.add(UserRoleORM(user_id=user.id, role_id=role_id))


@router.put("/users/{user_id}/roles", response_model=UserSummary)
def set_user_roles(
    user_id: int,
    payload: UserRolesUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> UserSummary:
    user = _get_internal_user_or_404(db, user_id)
    roles = _resolve_assignable_roles(db, payload.role_ids)
    _replace_user_roles(db, user, roles)
    _commit_keeping_one_manager(db)
    roles_map = _user_roles_batch(db, [user.id])
    return _user_summary(db, user, roles_map)


@router.patch("/users/{user_id}", response_model=UserSummary)
def update_internal_user(
    user_id: int,
    payload: InternalUserUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> UserSummary:
    user = _get_internal_user_or_404(db, user_id)
    changes = payload.model_dump(exclude_unset=True)

    if "username" in changes:
        username = _validate_internal_username(changes["username"] or "")
        if username != user.username and db.scalar(
            select(UserORM.id).where(UserORM.username == username, UserORM.id != user.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )
        user.username = username

    if "email" in changes:
        # Email uniqueness is enforced only if the DB has a unique constraint.
        # Without a confirmed Model/Migration rule, do not invent application-level
        # uniqueness here; IntegrityError is mapped below when the DB rejects it.
        user.email = str(changes["email"]) if changes["email"] is not None else None

    if "password" in changes:
        password = changes["password"]
        # null / omitted: leave hash unchanged. Empty string is invalid (422).
        if password is None:
            pass
        elif password == "":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="password cannot be empty",
            )
        else:
            _validate_internal_password(password)
            user.password_hash = get_password_hash(password)

    if "role_ids" in changes and changes["role_ids"] is not None:
        roles = _resolve_assignable_roles(db, changes["role_ids"])
        _replace_user_roles(db, user, roles)

    try:
        _commit_keeping_one_manager(db)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_integrity_conflict_detail(exc),
        ) from exc
    db.refresh(user)
    roles_map = _user_roles_batch(db, [user.id])
    return _user_summary(db, user, roles_map)
