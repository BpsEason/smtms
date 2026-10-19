from dataclasses import asdict

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, ensure_supplier_access, require_permission
from app.db.session import get_db
from app.models.quality import (
    MaterialORM,
    SupplierMaterialORM,
    SupplierORM,
    SupplierQualificationDocumentORM,
)
from app.schemas.catalog import (
    PaginatedResponse,
    SupplierCreate,
    SupplierDocumentResponse,
    SupplierImportCreatedAccount,
    SupplierImportPreviewResponse,
    SupplierImportResultResponse,
    SupplierImportRowError,
    SupplierImportRowPreview,
    SupplierMaterialCreate,
    SupplierMaterialResponse,
    SupplierResponse,
    SupplierUpdate,
)
from app.services import supplier_import

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _get_supplier(db: Session, supplier_id: int) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


@router.get("", response_model=PaginatedResponse[SupplierResponse])
def list_suppliers(
    keyword: str | None = Query(default=None, max_length=200),
    supplier_status: str | None = Query(default=None, alias="status", max_length=20),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    statement = select(SupplierORM)
    count_statement = select(func.count()).select_from(SupplierORM)
    if current_user.supplier_id is not None:
        statement = statement.where(SupplierORM.id == current_user.supplier_id)
        count_statement = count_statement.where(SupplierORM.id == current_user.supplier_id)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = (SupplierORM.supplier_code.ilike(pattern)) | (
            SupplierORM.supplier_name.ilike(pattern)
        )
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if supplier_status:
        statement = statement.where(SupplierORM.status == supplier_status)
        count_statement = count_statement.where(SupplierORM.status == supplier_status)

    total = db.scalar(count_statement) or 0
    suppliers = db.scalars(
        statement.order_by(SupplierORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[SupplierResponse](
        items=[SupplierResponse.model_validate(supplier) for supplier in suppliers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    if db.scalar(
        select(SupplierORM.id).where(SupplierORM.supplier_code == payload.supplier_code)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier code already exists",
        )

    supplier = SupplierORM(**payload.model_dump())
    db.add(supplier)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier code already exists",
        ) from exc
    db.refresh(supplier)
    return supplier


@router.get("/import/template")
def download_supplier_import_template(
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> Response:
    return Response(
        content=supplier_import.build_template_bytes(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="supplier-import-template.xlsx"'},
    )


def _parse_upload(file: UploadFile) -> supplier_import.ParsedWorkbook:
    content = file.file.read(supplier_import.MAX_FILE_BYTES + 1)
    try:
        return supplier_import.parse_supplier_workbook(content)
    except supplier_import.ImportFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="；".join(error.message for error in exc.errors),
        ) from exc


@router.post("/import/preview", response_model=SupplierImportPreviewResponse)
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


@router.post("/import/confirm", response_model=SupplierImportResultResponse)
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


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_id)
    return _get_supplier(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    ensure_supplier_access(current_user, supplier_id)
    supplier = _get_supplier(db, supplier_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return supplier
    new_code = changes.get("supplier_code")
    if new_code and new_code != supplier.supplier_code:
        duplicate = db.scalar(
            select(SupplierORM.id).where(
                SupplierORM.supplier_code == new_code,
                SupplierORM.id != supplier_id,
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Supplier code already exists",
            )
    for field, value in changes.items():
        setattr(supplier, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier code already exists",
        ) from exc
    db.refresh(supplier)
    return supplier


@router.get("/{supplier_id}/documents", response_model=list[SupplierDocumentResponse])
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


@router.post(
    "/{supplier_id}/materials",
    response_model=SupplierMaterialResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_supplier_material(
    supplier_id: int,
    payload: SupplierMaterialCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    ensure_supplier_access(current_user, supplier_id)
    supplier = _get_supplier(db, supplier_id)
    material = db.get(MaterialORM, payload.material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")

    existing = db.scalar(
        select(SupplierMaterialORM.id).where(
            SupplierMaterialORM.supplier_id == supplier_id,
            SupplierMaterialORM.material_id == payload.material_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supply relationship already exists",
        )

    if payload.is_preferred:
        db.execute(
            update(SupplierMaterialORM)
            .where(SupplierMaterialORM.material_id == payload.material_id)
            .values(is_preferred=False)
        )
    link = SupplierMaterialORM(
        supplier_id=supplier.id,
        material_id=material.id,
        supplier_material_code=payload.supplier_material_code,
        is_preferred=payload.is_preferred,
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supply relationship already exists",
        ) from exc
    db.refresh(link)
    return link


@router.delete("/{supplier_id}/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_supplier_material(
    supplier_id: int,
    material_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> Response:
    ensure_supplier_access(current_user, supplier_id)
    _get_supplier(db, supplier_id)
    link = db.scalar(
        select(SupplierMaterialORM).where(
            SupplierMaterialORM.supplier_id == supplier_id,
            SupplierMaterialORM.material_id == material_id,
        )
    )
    if link is None:
        if db.get(MaterialORM, material_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supply relationship not found",
        )
    db.delete(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
