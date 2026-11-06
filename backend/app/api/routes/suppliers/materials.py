"""Supplier-material association management."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, ensure_supplier_access, require_permission
from app.db.session import get_db
from app.models.quality import MaterialORM, SupplierMaterialORM, SupplierORM
from app.schemas.catalog import SupplierMaterialCreate, SupplierMaterialResponse

router = APIRouter(prefix="/{supplier_id}/materials", tags=["supplier-materials"])


def _get_supplier(db: Session, supplier_id: int) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


@router.post(
    "",
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

    # Lock material master record with SELECT FOR UPDATE to prevent race conditions
    material = db.execute(
        select(MaterialORM).where(MaterialORM.id == payload.material_id).with_for_update()
    ).scalar_one_or_none()
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
        preferred_links = db.scalars(
            select(SupplierMaterialORM)
            .where(
                SupplierMaterialORM.material_id == payload.material_id,
                SupplierMaterialORM.is_preferred.is_(True),
            )
            .with_for_update()
        ).all()
        for existing_link in preferred_links:
            existing_link.is_preferred = False
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


@router.delete(
    "/{material_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
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
