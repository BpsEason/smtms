"""Supplier qualification documents and attachments CRUD operations."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, ensure_supplier_access, require_permission
from app.db.session import get_db
from app.models.quality import (
    SupplierDocumentAttachmentORM,
    SupplierORM,
    SupplierQualificationDocumentORM,
)
from app.schemas.catalog import (
    SupplierDocumentAttachmentResponse,
    SupplierDocumentCreate,
    SupplierDocumentResponse,
    SupplierDocumentUpdate,
)
from app.services import document_storage

router = APIRouter(prefix="/{supplier_id}/documents", tags=["supplier-documents"])


def _get_supplier(db: Session, supplier_id: int) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _get_supplier_document(
    db: Session,
    supplier_id: int,
    document_id: int,
) -> SupplierQualificationDocumentORM:
    document = db.scalar(
        select(SupplierQualificationDocumentORM).where(
            SupplierQualificationDocumentORM.id == document_id,
            SupplierQualificationDocumentORM.supplier_id == supplier_id,
        )
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier document not found",
        )
    return document


def _get_document_attachment(
    db: Session,
    document: SupplierQualificationDocumentORM,
    attachment_id: int,
) -> SupplierDocumentAttachmentORM:
    attachment = db.scalar(
        select(SupplierDocumentAttachmentORM).where(
            SupplierDocumentAttachmentORM.id == attachment_id,
            SupplierDocumentAttachmentORM.document_id == document.id,
        )
    )
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return attachment


@router.get(
    "",
    response_model=list[SupplierDocumentResponse],
)
def list_supplier_documents(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    return db.scalars(
        select(SupplierQualificationDocumentORM)
        .where(SupplierQualificationDocumentORM.supplier_id == supplier_id)
        .order_by(SupplierQualificationDocumentORM.id)
    ).all()


@router.get(
    "/{document_id}",
    response_model=SupplierDocumentResponse,
)
def get_supplier_document(
    supplier_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    return _get_supplier_document(db, supplier_id, document_id)


@router.post(
    "",
    response_model=SupplierDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier_document(
    supplier_id: int,
    payload: SupplierDocumentCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    ensure_supplier_access(current_user, supplier_id)
    supplier = _get_supplier(db, supplier_id)
    document = SupplierQualificationDocumentORM(
        supplier_id=supplier.id,
        **payload.model_dump(),
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.patch(
    "/{document_id}",
    response_model=SupplierDocumentResponse,
)
def update_supplier_document(
    supplier_id: int,
    document_id: int,
    payload: SupplierDocumentUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    document = _get_supplier_document(db, supplier_id, document_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(document, field, value)
    if document.issued_at and document.expires_at and document.expires_at < document.issued_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document expiry date cannot precede issue date",
        )
    db.commit()
    db.refresh(document)
    return document


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_supplier_document(
    supplier_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> Response:
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    document = _get_supplier_document(db, supplier_id, document_id)
    keys = [item.storage_key for item in document.attachments]
    db.delete(document)
    db.commit()
    for key in keys:
        try:
            document_storage.remove_attachment(key)
        except OSError:
            # The database is authoritative; storage maintenance can remove orphan files.
            pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{document_id}/attachments",
    response_model=list[SupplierDocumentAttachmentResponse],
)
def list_supplier_document_attachments(
    supplier_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    document = _get_supplier_document(db, supplier_id, document_id)
    return db.scalars(
        select(SupplierDocumentAttachmentORM)
        .where(SupplierDocumentAttachmentORM.document_id == document.id)
        .order_by(SupplierDocumentAttachmentORM.id)
    ).all()


@router.post(
    "/{document_id}/attachments",
    response_model=SupplierDocumentAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_supplier_document_attachment(
    supplier_id: int,
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    document = _get_supplier_document(db, supplier_id, document_id)
    content, media_type, filename, storage_key = document_storage.read_valid_upload(file)
    try:
        document_storage.write_attachment(storage_key, content)
        attachment = SupplierDocumentAttachmentORM(
            document_id=document.id,
            original_filename=filename,
            storage_key=storage_key,
            media_type=media_type,
            size_bytes=len(content),
            sha256=document_storage.sha256(content),
        )
        db.add(attachment)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        document_storage.remove_attachment(storage_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attachment metadata conflict",
        ) from exc
    except Exception:
        db.rollback()
        document_storage.remove_attachment(storage_key)
        raise
    db.refresh(attachment)
    return attachment


@router.get(
    "/{document_id}/attachments/{attachment_id}/download",
)
def download_supplier_document_attachment(
    supplier_id: int,
    document_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    document = _get_supplier_document(db, supplier_id, document_id)
    attachment = _get_document_attachment(db, document, attachment_id)
    path = document_storage.resolve_storage_key(attachment.storage_key)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found",
        )
    return FileResponse(
        path,
        media_type=attachment.media_type,
        filename=Path(attachment.original_filename).name,
    )


@router.delete(
    "/{document_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_supplier_document_attachment(
    supplier_id: int,
    document_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> Response:
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    document = _get_supplier_document(db, supplier_id, document_id)
    attachment = _get_document_attachment(db, document, attachment_id)
    storage_key = attachment.storage_key
    db.delete(attachment)
    db.commit()
    try:
        document_storage.remove_attachment(storage_key)
    except OSError:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
