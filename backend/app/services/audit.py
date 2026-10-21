"""Transactional ORM audit capture with conservative secret filtering."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.models.audit import AuditLogORM

_SENSITIVE_PARTS = (
    "password",
    "token",
    "secret",
    "credential",
    "private_key",
    "api_key",
    "authorization",
    "password_hash",
    "storage_key",
    "file_path",
    "certificate",
)
_SECRET_VALUE = re.compile(
    r"(?i)(bearer\s+\S+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*\S+)"
)
_JWT_VALUE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")


def _safe_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, str):
        value = _SECRET_VALUE.sub("[REDACTED]", value)
        return _JWT_VALUE.sub("[REDACTED]", value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _snapshot(obj: Any, *, changed_only: bool = False) -> dict[str, Any]:
    state = inspect(obj)
    result: dict[str, Any] = {}
    for column in state.mapper.column_attrs:
        key = column.key
        lowered = key.lower()
        if any(part in lowered for part in _SENSITIVE_PARTS):
            continue
        if changed_only:
            history = state.attrs[key].history
            if not history.has_changes():
                continue
            old = history.deleted[0] if history.deleted else None
            new = history.added[0] if history.added else getattr(obj, key)
            result[key] = {"old": _safe_value(old), "new": _safe_value(new)}
        else:
            result[key] = _safe_value(getattr(obj, key))
    return result


@event.listens_for(Session, "before_flush")
def collect_audit_changes(session: Session, _flush_context: Any, _instances: Any) -> None:
    if session.info.get("audit_suspended") or session.info.get("audit_actor_id") is None:
        return
    pending: list[dict[str, Any]] = []
    for obj in session.new:
        if isinstance(obj, AuditLogORM):
            continue
        pending.append({"action": "CREATE", "obj": obj, "before": None, "after": _snapshot(obj)})
    for obj in session.dirty:
        if isinstance(obj, AuditLogORM):
            if session.is_modified(obj, include_collections=False):
                raise ValueError("Audit logs are immutable")
            continue
        if not session.is_modified(obj, include_collections=False):
            continue
        changes = _snapshot(obj, changed_only=True)
        if changes:
            pending.append(
                {
                    "action": "UPDATE",
                    "obj": obj,
                    "before": {k: v["old"] for k, v in changes.items()},
                    "after": {k: v["new"] for k, v in changes.items()},
                }
            )
    for obj in session.deleted:
        if isinstance(obj, AuditLogORM):
            raise ValueError("Audit logs are immutable")
        pending.append({"action": "DELETE", "obj": obj, "before": _snapshot(obj), "after": None})
    session.info.setdefault("audit_pending", []).extend(pending)


@event.listens_for(Session, "after_flush")
def persist_audit_changes(session: Session, _flush_context: Any) -> None:
    pending = session.info.pop("audit_pending", [])
    actor_id = session.info.get("audit_actor_id")
    request_id = session.info.get("request_id")
    for item in pending:
        obj = item["obj"]
        session.add(
            AuditLogORM(
                actor_user_id=actor_id,
                action=item["action"],
                resource_type=inspect(obj).mapper.local_table.name,
                resource_id=str(getattr(obj, "id", "")) or None,
                before_data=item["before"],
                after_data=item["after"],
                request_id=request_id,
            )
        )


@event.listens_for(Session, "after_rollback")
def clear_rolled_back_audit_changes(session: Session) -> None:
    session.info.pop("audit_pending", None)


@event.listens_for(Session, "after_soft_rollback")
def clear_soft_rolled_back_audit_changes(session: Session, _previous_transaction: Any) -> None:
    session.info.pop("audit_pending", None)
