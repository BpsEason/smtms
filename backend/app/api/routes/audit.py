import csv
import io
import json
from collections.abc import Iterable, Iterator
from datetime import datetime
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, require_permission
from app.db.session import SessionLocal, get_db
from app.models.audit import AuditLogORM
from app.models.user import UserORM

router = APIRouter(prefix="/audit-logs", tags=["audit"])

MAX_EXPORT_ROWS = 50000
MAX_EXPORT_DAYS = 365


def _apply_audit_filters(
    statement: Select[Any, Any],
    *,
    resource_type: str | None,
    resource_id: str | None,
    actor_user_id: int | None,
    actor_username: str | None,
    action: str | None,
    start_at: datetime | None,
    end_at: datetime | None,
) -> Select[Any, Any]:
    if resource_type:
        statement = statement.where(AuditLogORM.resource_type == resource_type)

    if resource_id:
        statement = statement.where(AuditLogORM.resource_id == resource_id)

    if actor_user_id is not None:
        statement = statement.where(AuditLogORM.actor_user_id == actor_user_id)

    if actor_username and actor_username.strip():
        statement = statement.where(UserORM.username.ilike(f"%{actor_username.strip()}%"))

    if action and action.strip():
        statement = statement.where(func.upper(AuditLogORM.action) == action.strip().upper())

    if start_at:
        statement = statement.where(AuditLogORM.created_at >= start_at)

    if end_at:
        statement = statement.where(AuditLogORM.created_at <= end_at)

    return statement


def _filtered_statement(
    *,
    resource_type: str | None,
    resource_id: str | None,
    actor_user_id: int | None,
    actor_username: str | None,
    action: str | None,
    start_at: datetime | None,
    end_at: datetime | None,
) -> Select[AuditLogORM, str]:
    statement = select(AuditLogORM, UserORM.username).outerjoin(
        UserORM,
        UserORM.id == AuditLogORM.actor_user_id,
    )

    return _apply_audit_filters(
        statement,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        action=action,
        start_at=start_at,
        end_at=end_at,
    )


def _count_statement(
    statement: Select[Any, Any],
) -> Select[int]:
    """
    Count 使用與列表、匯出完全相同的 JOIN 與 WHERE 條件。
    移除排序後透過 Subquery 計算筆數。
    """
    filtered_subquery = statement.order_by(None).subquery()

    return select(func.count()).select_from(filtered_subquery)


def _csv_cell(value: object) -> str:
    text = "" if value is None else str(value)

    if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        text = "'" + text

    return text


def _audit_csv(
    db: Session,
    statement: Select[AuditLogORM, str],
) -> Iterator[str]:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)

    writer.writerow(
        [
            "操作時間",
            "操作者",
            "操作類型",
            "資源類型",
            "資源 ID",
            "異動前",
            "異動後",
        ]
    )

    yield "\ufeff" + buffer.getvalue()

    buffer.seek(0)
    buffer.truncate(0)

    result = cast(
        Iterable[tuple[AuditLogORM, str | None]],
        db.execute(statement.execution_options(yield_per=500)),
    )

    for log, username in result:
        writer.writerow(
            [
                _csv_cell(cell)
                for cell in [
                    log.created_at.isoformat() if log.created_at else "",
                    username or (f"user:{log.actor_user_id}" if log.actor_user_id else "系統"),
                    log.action,
                    log.resource_type,
                    log.resource_id,
                    (
                        json.dumps(
                            log.before_data,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                        if log.before_data is not None
                        else ""
                    ),
                    (
                        json.dumps(
                            log.after_data,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                        if log.after_data is not None
                        else ""
                    ),
                ]
            ]
        )

        yield buffer.getvalue()

        buffer.seek(0)
        buffer.truncate(0)


def _generate_audit_csv(
    statement: Select[AuditLogORM, str],
) -> Iterator[str]:
    """Generator that creates its own session for streaming response."""
    db = SessionLocal()

    try:
        yield from _audit_csv(db, statement)
    finally:
        db.close()


@router.get("")
def list_audit_logs(
    resource_type: str | None = Query(default=None, max_length=100),
    resource_id: str | None = Query(default=None, max_length=100),
    actor_user_id: int | None = Query(default=None, ge=1),
    actor_username: str | None = Query(default=None, max_length=80),
    action: str | None = Query(default=None, max_length=20),
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("audit:read")),
):
    statement = _filtered_statement(
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        action=action,
        start_at=start_at,
        end_at=end_at,
    )

    total = db.scalar(_count_statement(statement)) or 0

    rows = cast(
        list[tuple[AuditLogORM, str | None]],
        db.execute(
            statement.order_by(
                AuditLogORM.created_at.desc(),
                AuditLogORM.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all(),
    )

    return {
        "items": [
            {
                "id": row.id,
                "actor_user_id": row.actor_user_id,
                "actor_username": username,
                "action": row.action,
                "resource_type": row.resource_type,
                "resource_id": row.resource_id,
                "before_data": row.before_data,
                "after_data": row.after_data,
                "request_id": row.request_id,
                "created_at": row.created_at,
            }
            for row, username in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/export.csv")
def export_audit_logs(
    resource_type: str | None = Query(default=None, max_length=100),
    resource_id: str | None = Query(default=None, max_length=100),
    actor_user_id: int | None = Query(default=None, ge=1),
    actor_username: str | None = Query(default=None, max_length=80),
    action: str | None = Query(default=None, max_length=20),
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    _user: AuthenticatedUser = Depends(require_permission("audit:read")),
):
    if start_at is None and end_at is None:
        raise HTTPException(
            status_code=400,
            detail="匯出需指定時間範圍（start_at 與 end_at 至少一項）。",
        )

    if start_at and end_at and start_at > end_at:
        raise HTTPException(
            status_code=400,
            detail="開始時間不可晚於結束時間。",
        )

    if start_at and end_at and (end_at - start_at).days > MAX_EXPORT_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"時間範圍不可超過 {MAX_EXPORT_DAYS} 天。",
        )

    statement = _filtered_statement(
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        action=action,
        start_at=start_at,
        end_at=end_at,
    )

    db = SessionLocal()

    try:
        total = db.scalar(_count_statement(statement)) or 0

        if total > MAX_EXPORT_ROWS:
            raise HTTPException(
                status_code=400,
                detail=(f"匯出資料筆數超過上限 {MAX_EXPORT_ROWS} 筆，請縮小篩選條件。"),
            )
    finally:
        db.close()

    export_statement = statement.order_by(
        AuditLogORM.created_at.desc(),
        AuditLogORM.id.desc(),
    )

    return StreamingResponse(
        _generate_audit_csv(export_statement),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": ('attachment; filename="smtms-audit-logs.csv"')},
    )
