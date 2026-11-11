from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from hashlib import sha256 as hash_sha256
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, ensure_supplier_access, require_permission
from app.db.session import get_db
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    NonconformanceAttachmentORM,
    NonconformanceDispositionORM,
    NonconformanceHistoryORM,
    NonconformanceORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.models.user import UserORM
from app.schemas.nonconformance import (
    DispositionCreate,
    NonconformanceCreate,
    NonconformanceUpdate,
)
from app.services import document_storage

router = APIRouter(prefix="/nonconformances", tags=["nonconformance"])


def _case(db: Session, case_id: int, user: AuthenticatedUser) -> NonconformanceORM:
    case = db.get(NonconformanceORM, case_id)
    if case is None:
        raise HTTPException(404, "Nonconformance not found")
    if case.supplier_id is not None:
        ensure_supplier_access(user, case.supplier_id)
    elif user.supplier_id is not None:
        raise HTTPException(403, "Forbidden")
    return case


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _snapshot(case: NonconformanceORM) -> dict[str, Any]:
    keys = (
        "case_no",
        "title",
        "description",
        "source",
        "severity",
        "status",
        "found_at",
        "found_by_user_id",
        "owner_user_id",
        "supplier_id",
        "material_id",
        "receipt_id",
        "supplier_lot_id",
        "internal_lot_id",
        "iqc_record_id",
        "defect_qty",
        "investigation",
        "closed_at",
    )
    return {key: _serialize_value(getattr(case, key)) for key in keys}


def _history(
    db: Session,
    case: NonconformanceORM,
    actor: int,
    action: str,
    before: dict | None,
    event: dict | None = None,
) -> None:
    db.add(
        NonconformanceHistoryORM(
            nonconformance_id=case.id,
            actor_user_id=actor,
            action=action,
            before_data=json.dumps(before, ensure_ascii=False) if before is not None else None,
            after_data=json.dumps(
                {"case": _snapshot(case), "event": event},
                ensure_ascii=False,
            ),
        )
    )


def _parse_history_payload(raw: str | None) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return raw


def _detail(db: Session, case: NonconformanceORM) -> dict[str, Any]:
    dispositions = [
        {
            column.name: _serialize_value(getattr(row, column.name))
            for column in NonconformanceDispositionORM.__table__.columns
        }
        for row in db.scalars(
            select(NonconformanceDispositionORM)
            .where(NonconformanceDispositionORM.nonconformance_id == case.id)
            .order_by(NonconformanceDispositionORM.executed_at)
        ).all()
    ]

    history = []
    for row in db.scalars(
        select(NonconformanceHistoryORM)
        .where(NonconformanceHistoryORM.nonconformance_id == case.id)
        .order_by(NonconformanceHistoryORM.created_at, NonconformanceHistoryORM.id)
    ).all():
        history.append(
            {
                "id": row.id,
                "nonconformance_id": row.nonconformance_id,
                "actor_user_id": row.actor_user_id,
                "action": row.action,
                "before_data": _parse_history_payload(row.before_data),
                "after_data": _parse_history_payload(row.after_data),
                "created_at": _serialize_value(row.created_at),
            }
        )

    attachments = [
        {
            "id": item.id,
            "original_filename": item.original_filename,
            "media_type": item.media_type,
            "size_bytes": item.size_bytes,
            "sha256": item.sha256,
            "created_by_user_id": item.created_by_user_id,
            "created_at": _serialize_value(item.created_at),
        }
        for item in db.scalars(
            select(NonconformanceAttachmentORM)
            .where(NonconformanceAttachmentORM.nonconformance_id == case.id)
            .order_by(NonconformanceAttachmentORM.created_at)
        ).all()
    ]

    return {
        **_snapshot(case),
        "id": case.id,
        "created_at": _serialize_value(case.created_at),
        "updated_at": _serialize_value(case.updated_at),
        "dispositions": dispositions,
        "history": history,
        "attachments": attachments,
    }


def _validate_links(db: Session, data: dict[str, Any], user: AuthenticatedUser) -> None:
    receipt = db.get(MaterialReceiptORM, data["receipt_id"]) if data.get("receipt_id") else None
    lot = db.get(SupplierLotORM, data["supplier_lot_id"]) if data.get("supplier_lot_id") else None
    internal = (
        db.get(InternalMaterialLotORM, data["internal_lot_id"])
        if data.get("internal_lot_id")
        else None
    )
    iqc = db.get(IQCRecordORM, data["iqc_record_id"]) if data.get("iqc_record_id") else None
    material = db.get(MaterialORM, data["material_id"]) if data.get("material_id") else None
    supplier = db.get(SupplierORM, data["supplier_id"]) if data.get("supplier_id") else None

    lookup = {
        "receipt_id": (receipt, "Receipt"),
        "supplier_lot_id": (lot, "Supplier lot"),
        "internal_lot_id": (internal, "Internal lot"),
        "iqc_record_id": (iqc, "IQC record"),
        "material_id": (material, "Material"),
        "supplier_id": (supplier, "Supplier"),
    }
    for field, (obj, label) in lookup.items():
        if data.get(field) is not None and obj is None:
            raise HTTPException(404, f"{label} not found")

    required: set[str] = set()
    if (
        supplier is not None
        or lot is not None
        or receipt is not None
        or internal is not None
        or iqc is not None
    ):
        required.add("suppliers:read")
    if (
        material is not None
        or lot is not None
        or receipt is not None
        or internal is not None
        or iqc is not None
    ):
        required.add("materials:read")
    if receipt is not None or internal is not None or iqc is not None:
        required.add("receipts:read")
    if iqc is not None:
        required.add("iqc:read")

    missing = required - set(user.permissions)
    if missing:
        raise HTTPException(403, "Forbidden")

    if (
        internal is not None
        and data.get("receipt_id")
        and internal.receipt_id != data["receipt_id"]
    ):
        raise HTTPException(400, "Internal lot does not belong to the selected receipt")

    linked_receipt = receipt
    if linked_receipt is None and internal is not None and internal.receipt_id is not None:
        linked_receipt = db.get(MaterialReceiptORM, internal.receipt_id)

    linked_lot = lot
    linked_lot_id = (
        lot.id if lot is not None else (internal.supplier_lot_id if internal is not None else None)
    )
    if linked_lot is None and linked_lot_id is not None:
        linked_lot = db.get(SupplierLotORM, linked_lot_id)

    if linked_receipt is not None:
        if data.get("supplier_id") and data["supplier_id"] != linked_receipt.supplier_id:
            raise HTTPException(400, "Supplier does not match receipt")
        if data.get("material_id") and data["material_id"] != linked_receipt.material_id:
            raise HTTPException(400, "Material does not match receipt")
        if lot is not None and lot.id != linked_receipt.supplier_lot_id:
            raise HTTPException(400, "Supplier lot does not match receipt")

    if internal is not None and lot is not None and internal.supplier_lot_id != lot.id:
        raise HTTPException(400, "Supplier lot does not match internal lot")

    if linked_lot is not None:
        if data.get("supplier_id") and linked_lot.supplier_id != data["supplier_id"]:
            raise HTTPException(400, "Supplier does not match supplier lot")
        if data.get("material_id") and linked_lot.material_id != data["material_id"]:
            raise HTTPException(400, "Material does not match supplier lot")

    supplier_id = data.get("supplier_id")
    if supplier_id is None and linked_receipt is not None:
        supplier_id = linked_receipt.supplier_id
    if supplier_id is None and linked_lot is not None:
        supplier_id = linked_lot.supplier_id

    material_id = data.get("material_id")
    if material_id is None and linked_receipt is not None:
        material_id = linked_receipt.material_id
    if material_id is None and linked_lot is not None:
        material_id = linked_lot.material_id

    if supplier_id is not None and material_id is not None:
        linked = db.scalar(
            select(SupplierMaterialORM.id).where(
                SupplierMaterialORM.supplier_id == supplier_id,
                SupplierMaterialORM.material_id == material_id,
            )
        )
        if linked is None:
            raise HTTPException(400, "Supplier is not linked to the selected material")

    if iqc is not None:
        receipt_id = (
            linked_receipt.id
            if linked_receipt is not None
            else (internal.receipt_id if internal is not None else None)
        )
        if iqc.receipt_id and receipt_id and iqc.receipt_id != receipt_id:
            raise HTTPException(400, "IQC record does not match selected receipt")
        if iqc.internal_lot_id and internal is not None and iqc.internal_lot_id != internal.id:
            raise HTTPException(400, "IQC record does not match selected internal lot")
        if iqc.internal_lot_id and internal is None and data.get("receipt_id"):
            inspected_lot = db.get(InternalMaterialLotORM, iqc.internal_lot_id)
            if inspected_lot is not None and inspected_lot.receipt_id != data["receipt_id"]:
                raise HTTPException(400, "IQC record does not match selected receipt")
        if iqc.receipt_id and receipt is not None and iqc.receipt_id != receipt.id:
            raise HTTPException(400, "IQC record does not match selected receipt")

        # IQC 所關聯的內建 lot / 收料，在 case 中必須有對應記錄；不自動帶入，不允許關聯不完整。
        if iqc.internal_lot_id is not None and data.get("internal_lot_id") is None:
            raise HTTPException(400, "IQC record requires internal lot")
        if iqc.receipt_id is not None and data.get("receipt_id") is None:
            if data.get("internal_lot_id") is not None:
                inferred_internal = db.get(InternalMaterialLotORM, data["internal_lot_id"])
                if inferred_internal is None or inferred_internal.receipt_id != iqc.receipt_id:
                    raise HTTPException(400, "IQC record does not match selected receipt")
            else:
                raise HTTPException(400, "IQC record requires receipt")

    scope_supplier = data.get("supplier_id")
    if scope_supplier is None and linked_receipt is not None:
        scope_supplier = linked_receipt.supplier_id
    if scope_supplier is None and lot is not None:
        scope_supplier = lot.supplier_id

    if user.supplier_id is not None:
        if scope_supplier is None or user.supplier_id != scope_supplier:
            raise HTTPException(403, "Forbidden")


def _enrich_from_iqc(db: Session, values: dict[str, Any]) -> None:
    """Fill missing link fields from an IQC record when possible."""
    iqc_id = values.get("iqc_record_id")
    if not iqc_id:
        return

    iqc = db.get(IQCRecordORM, iqc_id)
    if iqc is None:
        return

    internal = db.get(InternalMaterialLotORM, iqc.internal_lot_id) if iqc.internal_lot_id else None
    receipt_id = iqc.receipt_id or (internal.receipt_id if internal is not None else None)
    receipt = db.get(MaterialReceiptORM, receipt_id) if receipt_id else None

    values["receipt_id"] = values.get("receipt_id") or receipt_id
    values["internal_lot_id"] = values.get("internal_lot_id") or iqc.internal_lot_id
    values["supplier_lot_id"] = values.get("supplier_lot_id") or (
        receipt.supplier_lot_id
        if receipt is not None
        else (internal.supplier_lot_id if internal is not None else None)
    )
    values["supplier_id"] = values.get("supplier_id") or (
        receipt.supplier_id if receipt is not None else None
    )
    values["material_id"] = values.get("material_id") or (
        receipt.material_id
        if receipt is not None
        else (internal.material_id if internal is not None else None)
    )

    if values.get("supplier_id") is None and values.get("supplier_lot_id"):
        linked_lot = db.get(SupplierLotORM, values["supplier_lot_id"])
        if linked_lot is not None:
            values["supplier_id"] = linked_lot.supplier_id


@router.get("")
def list_cases(
    q: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    source: str | None = None,
    supplier_id: int | None = None,
    lot_no: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:read")),
) -> dict[str, Any]:
    stmt = select(NonconformanceORM)
    if user.supplier_id is not None:
        stmt = stmt.where(NonconformanceORM.supplier_id == user.supplier_id)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                NonconformanceORM.case_no.like(term),
                NonconformanceORM.title.like(term),
                NonconformanceORM.description.like(term),
            )
        )
    if status_filter:
        stmt = stmt.where(NonconformanceORM.status == status_filter)
    if source:
        stmt = stmt.where(NonconformanceORM.source == source)
    if supplier_id:
        stmt = stmt.where(NonconformanceORM.supplier_id == supplier_id)
    if lot_no:
        stmt = stmt.outerjoin(
            SupplierLotORM, NonconformanceORM.supplier_lot_id == SupplierLotORM.id
        ).outerjoin(
            InternalMaterialLotORM,
            NonconformanceORM.internal_lot_id == InternalMaterialLotORM.id,
        )
        term = f"%{lot_no}%"
        stmt = stmt.where(
            or_(
                SupplierLotORM.supplier_lot_no.like(term),
                InternalMaterialLotORM.internal_lot_no.like(term),
            )
        )

    # Avoid double-counting when joins are present.
    count_stmt = select(func.count(func.distinct(NonconformanceORM.id)))
    if user.supplier_id is not None:
        count_stmt = count_stmt.where(NonconformanceORM.supplier_id == user.supplier_id)
    if q:
        term = f"%{q.strip()}%"
        count_stmt = count_stmt.where(
            or_(
                NonconformanceORM.case_no.like(term),
                NonconformanceORM.title.like(term),
                NonconformanceORM.description.like(term),
            )
        )
    if status_filter:
        count_stmt = count_stmt.where(NonconformanceORM.status == status_filter)
    if source:
        count_stmt = count_stmt.where(NonconformanceORM.source == source)
    if supplier_id:
        count_stmt = count_stmt.where(NonconformanceORM.supplier_id == supplier_id)
    if lot_no:
        count_stmt = count_stmt.outerjoin(
            SupplierLotORM, NonconformanceORM.supplier_lot_id == SupplierLotORM.id
        ).outerjoin(
            InternalMaterialLotORM,
            NonconformanceORM.internal_lot_id == InternalMaterialLotORM.id,
        )
        term = f"%{lot_no}%"
        count_stmt = count_stmt.where(
            or_(
                SupplierLotORM.supplier_lot_no.like(term),
                InternalMaterialLotORM.internal_lot_no.like(term),
            )
        )

    total = db.scalar(count_stmt) or 0
    items = db.scalars(
        stmt.order_by(NonconformanceORM.updated_at.desc(), NonconformanceORM.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "items": [
            {
                **_snapshot(item),
                "id": item.id,
                "created_at": _serialize_value(item.created_at),
                "updated_at": _serialize_value(item.updated_at),
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_case(
    payload: NonconformanceCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:write")),
) -> dict[str, Any]:
    if user.supplier_id is not None:
        raise HTTPException(403, "Internal users only")

    values = payload.model_dump()
    # found_by is always the authenticated actor; ignore any client-supplied value.
    values["found_by_user_id"] = user.id

    _enrich_from_iqc(db, values)
    _validate_links(db, values, user)

    if values.get("owner_user_id") and db.get(UserORM, values["owner_user_id"]) is None:
        raise HTTPException(404, "Owner not found")

    case = NonconformanceORM(**values)
    db.add(case)
    try:
        db.flush()
        _history(db, case, user.id, "created", None)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Case number already exists") from exc

    db.refresh(case)
    return _detail(db, case)


@router.get("/{case_id}")
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:read")),
) -> dict[str, Any]:
    return _detail(db, _case(db, case_id, user))


@router.patch("/{case_id}")
def update_case(
    case_id: int,
    payload: NonconformanceUpdate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:write")),
) -> dict[str, Any]:
    if user.supplier_id is not None:
        raise HTTPException(403, "Internal users only")

    case = _case(db, case_id, user)
    if case.status == "closed":
        raise HTTPException(409, "Closed cases cannot be edited")

    values = payload.model_dump(exclude_unset=True)
    before = _snapshot(case)
    previous_status = case.status
    closing = values.get("status") == "closed"

    if "status" in values:
        allowed = {
            "open": {"investigating"},
            "investigating": {"pending_confirmation"},
            "pending_confirmation": {"investigating", "closed"},
        }
        if values["status"] not in allowed.get(case.status, set()):
            raise HTTPException(
                409, f"Invalid status transition: {case.status} -> {values['status']}"
            )
        if values["status"] == "closed":
            if not case.investigation and not values.get("investigation"):
                raise HTTPException(409, "Investigation is required before closing")
            completed = db.scalar(
                select(NonconformanceDispositionORM.id)
                .where(NonconformanceDispositionORM.nonconformance_id == case.id)
                .limit(1)
            )
            if completed is None:
                raise HTTPException(
                    409, "At least one completed disposition is required before closing"
                )

    link_fields = {
        "supplier_id",
        "material_id",
        "receipt_id",
        "supplier_lot_id",
        "internal_lot_id",
        "iqc_record_id",
    }
    if link_fields.intersection(values):
        combined = {key: getattr(case, key) for key in link_fields}
        combined.update(values)
        _validate_links(db, combined, user)

    if values.get("owner_user_id") and db.get(UserORM, values["owner_user_id"]) is None:
        raise HTTPException(404, "Owner not found")

    for key, value in values.items():
        setattr(case, key, value)

    if closing:
        case.closed_at = datetime.now(timezone.utc)

    action = (
        "status_changed"
        if "status" in values and values["status"] != previous_status
        else "updated"
    )
    _history(db, case, user.id, action, before)
    db.commit()
    db.refresh(case)
    return _detail(db, case)


@router.post("/{case_id}/dispositions", status_code=status.HTTP_201_CREATED)
def add_disposition(
    case_id: int,
    payload: DispositionCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:write")),
) -> dict[str, Any]:
    if user.supplier_id is not None:
        raise HTTPException(403, "Internal users only")

    case = _case(db, case_id, user)
    if case.status == "closed":
        raise HTTPException(409, "Closed cases cannot receive dispositions")
    if db.get(UserORM, payload.owner_user_id) is None:
        raise HTTPException(404, "Disposition owner not found")

    entry = NonconformanceDispositionORM(
        nonconformance_id=case.id,
        created_by_user_id=user.id,
        **payload.model_dump(),
    )
    case.updated_at = datetime.now(timezone.utc)
    db.add(entry)
    _history(
        db,
        case,
        user.id,
        "disposition_added",
        None,
        payload.model_dump(mode="json"),
    )
    db.commit()
    return _detail(db, case)


@router.post("/{case_id}/attachments", status_code=201)
def upload_attachment(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:write")),
) -> dict[str, Any]:
    if user.supplier_id is not None:
        raise HTTPException(403, "Internal users only")

    case = _case(db, case_id, user)
    content, media_type, filename, storage_key = document_storage.read_valid_upload(file)
    digest = hash_sha256(content).hexdigest()

    attachment = NonconformanceAttachmentORM(
        nonconformance_id=case.id,
        original_filename=filename,
        storage_key=storage_key,
        media_type=media_type,
        size_bytes=len(content),
        sha256=digest,
        created_by_user_id=user.id,
    )
    db.add(attachment)
    case.updated_at = datetime.now(timezone.utc)
    _history(
        db,
        case,
        user.id,
        "attachment_added",
        None,
        {
            "filename": filename,
            "sha256": digest,
            "size_bytes": len(content),
        },
    )

    try:
        document_storage.write_attachment(storage_key, content)
        db.commit()
    except Exception:
        db.rollback()
        try:
            document_storage.remove_attachment(storage_key)
        except OSError:
            pass
        raise

    db.refresh(attachment)
    return {
        "id": attachment.id,
        "nonconformance_id": attachment.nonconformance_id,
        "original_filename": attachment.original_filename,
        "media_type": attachment.media_type,
        "size_bytes": attachment.size_bytes,
        "sha256": attachment.sha256,
        "created_by_user_id": attachment.created_by_user_id,
        "created_at": _serialize_value(attachment.created_at),
    }


@router.get("/{case_id}/attachments/{attachment_id}/download")
def download_attachment(
    case_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:read")),
) -> FileResponse:
    case = _case(db, case_id, user)
    attachment = db.scalar(
        select(NonconformanceAttachmentORM).where(
            NonconformanceAttachmentORM.id == attachment_id,
            NonconformanceAttachmentORM.nonconformance_id == case.id,
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    return FileResponse(
        document_storage.resolve_storage_key(attachment.storage_key),
        media_type=attachment.media_type,
        filename=attachment.original_filename,
    )


@router.delete("/{case_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    case_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("nonconformance:write")),
) -> Response:
    if user.supplier_id is not None:
        raise HTTPException(403, "Internal users only")

    case = _case(db, case_id, user)
    attachment = db.scalar(
        select(NonconformanceAttachmentORM).where(
            NonconformanceAttachmentORM.id == attachment_id,
            NonconformanceAttachmentORM.nonconformance_id == case.id,
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")

    storage_key = attachment.storage_key
    case.updated_at = datetime.now(timezone.utc)
    _history(
        db,
        case,
        user.id,
        "attachment_removed",
        None,
        {"filename": attachment.original_filename, "sha256": attachment.sha256},
    )
    db.delete(attachment)
    db.flush()
    try:
        document_storage.remove_attachment(storage_key)
    except OSError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Failed to delete attachment file",
        ) from exc
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
