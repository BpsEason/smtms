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
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, text
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


def _role_permission_codes(db: Session, role_id: int) -> list[str]:
    codes = db.scalars(
        select(PermissionORM.code)
        .join(RolePermissionORM, RolePermissionORM.permission_id == PermissionORM.id)
        .where(RolePermissionORM.role_id == role_id)
    ).all()
    return sorted({normalize_permission_code(code) for code in codes})


def _role_user_count(db: Session, role_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(UserRoleORM).where(UserRoleORM.role_id == role_id)
        )
        or 0
    )


def _role_summary(db: Session, role: RoleORM) -> RoleSummary:
    return RoleSummary(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=_role_permission_codes(db, role.id),
        user_count=_role_user_count(db, role.id),
        is_system=role.name == SUPPLIER_ROLE_NAME,
    )


def _user_summary(db: Session, user: UserORM) -> UserSummary:
    names = db.scalars(
        select(RoleORM.name)
        .join(UserRoleORM, UserRoleORM.role_id == RoleORM.id)
        .where(UserRoleORM.user_id == user.id)
        .order_by(RoleORM.name)
    ).all()
    return UserSummary(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        roles=list(names),
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
    rows = db.execute(_management_grants_statement()).all()
    return {
        user_id
        for user_id, code in rows
        if normalize_permission_code(code) == MANAGE_PERMISSION
    }


@contextmanager
def _management_mutex(db: Session) -> Iterator[None]:
    """Serialize management writes so the last-manager check cannot race.

    MySQL (the production engine) uses a named advisory lock: the invariant
    spans rows that concurrent transactions insert and delete, so locking the
    matched rows alone cannot prevent a lost update. The lock is connection
    scoped and therefore released explicitly. Other dialects (the test suite
    runs on SQLite) have no advisory lock and keep the same code path.
    """
    if db.get_bind().dialect.name != "mysql":
        yield
        return
    acquired = db.execute(
        text("SELECT GET_LOCK(:name, :timeout)"),
        {"name": MANAGE_LOCK_NAME, "timeout": MANAGE_LOCK_TIMEOUT_SECONDS},
    ).scalar()
    if acquired != 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="其他權限管理操作正在進行中，請稍後再試。",
        )
    try:
        yield
    finally:
        db.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": MANAGE_LOCK_NAME})
        db.commit()


def _commit_keeping_one_manager(db: Session) -> None:
    """Persist pending changes, refusing to remove the last access manager.

    The lock, the check and the commit share one transaction boundary: pending
    writes are flushed inside the mutex and the manager set is re-read as a
    current read. A refusal rolls the whole change back.
    """
    with _management_mutex(db):
        db.flush()
        if not _management_grants(db):
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="操作會移除最後一位具備使用者管理權限的管理員，已拒絕。",
            )
        db.commit()


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
    return [_role_summary(db, role) for role in roles]


@router.post("/roles", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> RoleSummary:
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
    return _role_summary(db, role)


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
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Role name cannot be blank",
            )
        if role.name == SUPPLIER_ROLE_NAME and new_name != role.name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="系統的供應商入口角色不可重新命名。",
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
    return _role_summary(db, role)


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
    return _role_summary(db, role)


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
    if _role_user_count(db, role.id):
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
    return [_user_summary(db, user) for user in users]


@router.post("/users", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
def create_internal_user(
    payload: InternalUserCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> UserSummary:
    username = payload.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="帳號僅能使用英文字母、數字、句點、底線及連字號。",
        )
    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password must be at most 72 UTF-8 bytes",
        )
    if db.scalar(select(UserORM.id).where(UserORM.username == username)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    role_ids = set(payload.role_ids)
    roles = (
        db.scalars(select(RoleORM).where(RoleORM.id.in_(role_ids))).all()
        if role_ids
        else []
    )
    if len(roles) != len(role_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if any(role.name == SUPPLIER_ROLE_NAME for role in roles):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="供應商入口角色不可指派給內部使用者。",
        )

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
            detail="Username already exists",
        ) from exc
    db.refresh(user)
    return _user_summary(db, user)


@router.put("/users/{user_id}/roles", response_model=UserSummary)
def set_user_roles(
    user_id: int,
    payload: UserRolesUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission(MANAGE_PERMISSION)),
) -> UserSummary:
    user = db.get(UserORM, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.supplier_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="供應商入口帳號不可指派內部角色。",
        )

    role_ids = set(payload.role_ids)
    roles = (
        db.scalars(select(RoleORM).where(RoleORM.id.in_(role_ids))).all()
        if role_ids
        else []
    )
    if len(roles) != len(role_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if any(role.name == SUPPLIER_ROLE_NAME for role in roles):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="供應商入口角色不可指派給內部使用者。",
        )

    existing = {
        link.role_id: link
        for link in db.scalars(select(UserRoleORM).where(UserRoleORM.user_id == user.id)).all()
    }
    for role_id, link in existing.items():
        if role_id not in role_ids:
            db.delete(link)
    for role_id in role_ids - set(existing):
        db.add(UserRoleORM(user_id=user.id, role_id=role_id))

    _commit_keeping_one_manager(db)
    return _user_summary(db, user)
