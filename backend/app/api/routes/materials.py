from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, require_permission
from app.db.session import get_db
from app.models.quality import MaterialORM, SupplierMaterialORM, SupplierORM
from app.schemas.catalog import (
    MaterialCreate,
    MaterialResponse,
    MaterialUpdate,
    PaginatedResponse,
    SupplierResponse,
)

router = APIRouter(prefix="/materials", tags=["materials"])


def _get_material(db: Session, material_id: int) -> MaterialORM:
    material = db.get(MaterialORM, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


@router.get("", response_model=PaginatedResponse[MaterialResponse])
def list_materials(
    keyword: str | None = Query(default=None, max_length=200),
    material_status: str | None = Query(default=None, alias="status", max_length=20),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    statement = select(MaterialORM)
    count_statement = select(func.count()).select_from(MaterialORM)
    if current_user.supplier_id is not None:
        supplier_material_ids = select(SupplierMaterialORM.material_id).where(
            SupplierMaterialORM.supplier_id == current_user.supplier_id
        )
        statement = statement.where(MaterialORM.id.in_(supplier_material_ids))
        count_statement = count_statement.where(MaterialORM.id.in_(supplier_material_ids))
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = (MaterialORM.material_code.ilike(pattern)) | (
            MaterialORM.material_name.ilike(pattern)
        )
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if material_status:
        statement = statement.where(MaterialORM.status == material_status)
        count_statement = count_statement.where(MaterialORM.status == material_status)

    total = db.scalar(count_statement) or 0
    materials = db.scalars(
        statement.order_by(MaterialORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[MaterialResponse](
        items=[MaterialResponse.model_validate(material) for material in materials],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("materials:write")),
):
    if db.scalar(select(MaterialORM.id).where(MaterialORM.material_code == payload.material_code)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Material code already exists",
        )

    material = MaterialORM(**payload.model_dump())
    db.add(material)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Material code already exists",
        ) from exc
    db.refresh(material)
    return material


@router.get("/{material_id}", response_model=MaterialResponse)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    if current_user.supplier_id is not None:
        material = db.scalar(
            select(SupplierMaterialORM.id).where(
                SupplierMaterialORM.material_id == material_id,
                SupplierMaterialORM.supplier_id == current_user.supplier_id,
            )
        )
        if material is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _get_material(db, material_id)


@router.patch("/{material_id}", response_model=MaterialResponse)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("materials:write")),
):
    if current_user.supplier_id is not None:
        material_link = db.scalar(
            select(SupplierMaterialORM.id).where(
                SupplierMaterialORM.material_id == material_id,
                SupplierMaterialORM.supplier_id == current_user.supplier_id,
            )
        )
        if material_link is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    material = _get_material(db, material_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return material
    new_code = changes.get("material_code")
    if new_code and new_code != material.material_code:
        duplicate = db.scalar(
            select(MaterialORM.id).where(
                MaterialORM.material_code == new_code,
                MaterialORM.id != material_id,
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Material code already exists",
            )
    for field, value in changes.items():
        setattr(material, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Material code already exists",
        ) from exc
    db.refresh(material)
    return material


@router.get("/{material_id}/suppliers", response_model=list[SupplierResponse])
def list_material_suppliers(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    if current_user.supplier_id is not None:
        supplier_link = db.scalar(
            select(SupplierMaterialORM.id).where(
                SupplierMaterialORM.material_id == material_id,
                SupplierMaterialORM.supplier_id == current_user.supplier_id,
            )
        )
        if supplier_link is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    _get_material(db, material_id)
    return db.scalars(
        select(SupplierORM)
        .join(
            SupplierMaterialORM,
            SupplierMaterialORM.supplier_id == SupplierORM.id,
        )
        .where(SupplierMaterialORM.material_id == material_id)
        .order_by(SupplierORM.id)
    ).all()
