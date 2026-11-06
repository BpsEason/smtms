"""Supplier import operations: template download, preview, and confirm."""

from dataclasses import asdict

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, require_permission
from app.db.session import get_db
from app.schemas.catalog import (
    SupplierImportCreatedAccount,
    SupplierImportPreviewResponse,
    SupplierImportResultResponse,
    SupplierImportRowError,
    SupplierImportRowPreview,
)
from app.services import supplier_import

router = APIRouter(prefix="/import", tags=["supplier-import"])


def _parse_upload(file: UploadFile) -> supplier_import.ParsedWorkbook:
    content = file.file.read(supplier_import.MAX_FILE_BYTES + 1)
    try:
        return supplier_import.parse_supplier_workbook(content)
    except supplier_import.ImportFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="；".join(error.message for error in exc.errors),
        ) from exc


@router.get("/template")
def download_supplier_import_template(
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> Response:
    return Response(
        content=supplier_import.build_template_bytes(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="supplier-import-template.xlsx"'},
    )


@router.post("/preview", response_model=SupplierImportPreviewResponse)
def preview_supplier_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> SupplierImportPreviewResponse:
    parsed = _parse_upload(file)
    outcome = supplier_import.validate_supplier_rows(db, parsed)
    valid_rows = {row.row for row in outcome.rows}
    error_rows = {error.row for error in outcome.errors}
    return SupplierImportPreviewResponse(
        sheet=outcome.sheet,
        total_rows=outcome.total_rows,
        valid_rows=len([row for row in outcome.rows if not row.skip]),
        error_rows=len(error_rows),
        skipped_rows=len(outcome.skipped_rows),
        rows=[
            SupplierImportRowPreview(
                row=item.row,
                supplier_code=item.values.get("supplier_code"),
                supplier_name=item.values.get("supplier_name"),
                tax_id=item.values.get("tax_id"),
                login_username=item.values.get("login_username"),
                login_email=item.values.get("login_email"),
                status=item.values.get("status"),
                valid=item.row in valid_rows,
            )
            for item in parsed.rows
        ],
        errors=[SupplierImportRowError(**asdict(error)) for error in outcome.errors],
    )


@router.post("/confirm", response_model=SupplierImportResultResponse)
def confirm_supplier_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> SupplierImportResultResponse:
    parsed = _parse_upload(file)
    outcome = supplier_import.validate_supplier_rows(db, parsed)
    skipped = len(outcome.skipped_rows)
    error_models = [SupplierImportRowError(**asdict(error)) for error in outcome.errors]
    if outcome.errors:
        return SupplierImportResultResponse(
            status="rejected",
            created=0,
            failed=len({error.row for error in outcome.errors}),
            skipped=skipped,
            errors=error_models,
            accounts=[],
        )

    pending_rows = len([row for row in outcome.rows if not row.skip])
    try:
        created = supplier_import.execute_supplier_import(db, outcome)
    except IntegrityError:
        db.rollback()
        return SupplierImportResultResponse(
            status="rejected",
            created=0,
            failed=pending_rows,
            skipped=skipped,
            errors=[
                SupplierImportRowError(
                    sheet=outcome.sheet,
                    row=0,
                    field="file",
                    message="寫入資料庫時發生衝突，已回復本次所有變更。",
                )
            ],
            accounts=[],
        )
    accounts = [SupplierImportCreatedAccount(**asdict(account)) for account in created]
    return SupplierImportResultResponse(
        status="completed",
        created=len(accounts),
        failed=0,
        skipped=skipped,
        errors=[],
        accounts=accounts,
    )
