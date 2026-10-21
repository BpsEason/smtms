import csv
import io
import json
from collections.abc import Iterable, Iterator
from datetime import datetime
from typing import cast

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, require_permission
from app.db.session import get_db
from app.models.audit import AuditLogORM
from app.models.user import UserORM

router = APIRouter(prefix="/audit-logs", tags=["audit"])


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
        UserORM, UserORM.id == AuditLogORM.actor_user_id
    )
    if resource_type:
        statement = statement.where(AuditLogORM.resource_type == resource_type)
    if resource_id:
        statement = statement.where(AuditLogORM.resource_id == resource_id)
    if actor_user_id is not None:
        statement = statement.where(AuditLogORM.actor_user_id == actor_user_id)
    if actor_username:
        statement = statement.where(UserORM.username.ilike(f"%{actor_username.strip()}%"))
    if action:
        statement = statement.where(AuditLogORM.action == action.upper())
    if start_at:
        statement = statement.where(AuditLogORM.created_at >= start_at)
    if end_at:
        statement = statement.where(AuditLogORM.created_at <= end_at)
    return statement.order_by(AuditLogORM.created_at.desc(), AuditLogORM.id.desc())


def _csv_cell(value: object) -> str:
    text = "" if value is None else str(value)
    if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        text = "'" + text
    return text


def _audit_csv(
    db: Session, statement: Select[AuditLogORM, str]
) -> Iterator[str]:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["操作時間", "操作者", "操作類型", "資源類型", "資源 ID", "異動前", "異動後"])
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
                    json.dumps(log.before_data, ensure_ascii=False, separators=(",", ":"))
                    if log.before_data is not None
                    else "",
                    json.dumps(log.after_data, ensure_ascii=False, separators=(",", ":"))
                    if log.after_data is not None
                    else "",
                ]
            ]
        )
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


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
    rows = cast(
        list[tuple[AuditLogORM, str | None]],
        db.execute(statement.offset((page - 1) * page_size).limit(page_size)).all(),
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
    return StreamingResponse(
        _audit_csv(db, statement),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="smtms-audit-logs.csv"'},
    )
