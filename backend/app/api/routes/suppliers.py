from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, require_permission
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
    SupplierMaterialCreate,
    SupplierMaterialResponse,
    SupplierResponse,
    SupplierUpdate,
)

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _next_id(db: Session, model) -> int:
    """Allocate IDs because the existing MySQL schema has non-AUTO_INCREMENT PKs."""
    return (db.scalar(select(func.max(model.id))) or 0) + 1


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
    _user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    statement = select(SupplierORM)
    count_statement = select(func.count()).select_from(SupplierORM)
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

    supplier = SupplierORM(id=_next_id(db, SupplierORM), **payload.model_dump())
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


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    return _get_supplier(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
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
    _user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
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
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
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
        id=_next_id(db, SupplierMaterialORM),
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
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
) -> Response:
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
