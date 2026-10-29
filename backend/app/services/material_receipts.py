from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, ensure_supplier_access
from app.models.quality import (
    InternalMaterialLotORM,
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.schemas.catalog import InternalLotCreate, ReceiptCreate


def _get_supplier(db: Session, supplier_id: int) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _get_material(db: Session, material_id: int) -> MaterialORM:
    material = db.get(MaterialORM, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


def _get_supplier_lot(db: Session, supplier_lot_id: int) -> SupplierLotORM:
    supplier_lot = db.get(SupplierLotORM, supplier_lot_id)
    if supplier_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier lot not found")
    return supplier_lot


def _get_receipt(db: Session, receipt_id: int) -> MaterialReceiptORM:
    receipt = db.get(MaterialReceiptORM, receipt_id)
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return receipt


def create_material_receipt(
    db: Session,
    payload: ReceiptCreate,
    current_user: AuthenticatedUser,
) -> MaterialReceiptORM:
    """Create a new material receipt with proper transaction and concurrency control."""
    ensure_supplier_access(current_user, payload.supplier_id)
    supplier = _get_supplier(db, payload.supplier_id)
    material = _get_material(db, payload.material_id)
    supplier_lot = _get_supplier_lot(db, payload.supplier_lot_id)

    if supplier_lot.supplier_id != supplier.id or supplier_lot.material_id != material.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier lot does not match the supplier and material",
        )

    # Lock the supplier lot to prevent concurrent modifications
    locked_supplier_lot = db.execute(
        select(SupplierLotORM).where(SupplierLotORM.id == supplier_lot.id).with_for_update()
    ).scalar_one()

    # Verify supplier-material link exists
    link = db.scalar(
        select(SupplierMaterialORM.id).where(
            SupplierMaterialORM.supplier_id == supplier.id,
            SupplierMaterialORM.material_id == material.id,
        )
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier is not linked to the material",
        )

    # Check for duplicate receipt number
    if db.scalar(
        select(MaterialReceiptORM.id).where(MaterialReceiptORM.receipt_no == payload.receipt_no)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Receipt number already exists"
        )

    # Validate quantity is positive
    if payload.qty_received <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be greater than zero"
        )

    # Check if we're exceeding the supplier lot's total quantity
    previously_received = db.scalar(
        select(func.coalesce(func.sum(MaterialReceiptORM.qty_received), 0)).where(
            MaterialReceiptORM.supplier_lot_id == locked_supplier_lot.id
        )
    ) or Decimal("0")
    if previously_received + payload.qty_received > locked_supplier_lot.qty_received:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt quantity exceeds the supplier lot's remaining declared quantity",
        )

    # Create the receipt
    receipt = MaterialReceiptORM(
        supplier_id=supplier.id,
        material_id=material.id,
        supplier_lot_id=supplier_lot.id,
        receipt_no=payload.receipt_no,
        received_at=payload.received_at,
        received_by_user_id=current_user.id,
        qty_received=payload.qty_received,
        qty_remaining=payload.qty_received,
        status="received",
        notes=payload.notes,
    )
    db.add(receipt)
    db.flush()

    # Refresh to get the generated ID and other database-generated values
    db.refresh(receipt)
    return receipt


def split_receipt_into_internal_lot(
    db: Session,
    receipt_id: int,
    payload: InternalLotCreate,
    current_user: AuthenticatedUser,
) -> InternalMaterialLotORM:
    """Split a material receipt into an internal lot with proper concurrency control."""
    receipt = _get_receipt(db, receipt_id)

    # Verify supplier access
    if current_user.supplier_id is not None and receipt.supplier_id != current_user.supplier_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Validate quantity
    if payload.qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Each split quantity must be greater than zero",
        )

    # Check for duplicate internal lot number
    if db.scalar(
        select(InternalMaterialLotORM.id).where(
            InternalMaterialLotORM.internal_lot_no == payload.internal_lot_no
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Internal lot number already exists"
        )

    # Lock the receipt to prevent concurrent splits
    locked_receipt = db.execute(
        select(MaterialReceiptORM).where(MaterialReceiptORM.id == receipt_id).with_for_update()
    ).scalar_one()

    original_remaining = locked_receipt.qty_remaining
    if payload.qty > original_remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Split quantity exceeds the remaining receipt quantity",
        )

    # Create the internal lot
    internal_lot = InternalMaterialLotORM(
        material_id=locked_receipt.material_id,
        supplier_lot_id=locked_receipt.supplier_lot_id,
        receipt_id=locked_receipt.id,
        internal_lot_no=payload.internal_lot_no,
        qty_on_hand=payload.qty,
        qty_reserved=Decimal("0.0000"),
        uom=locked_receipt.material.uom,
        lot_status="quarantine",
        expiry_date=payload.expiry_date or locked_receipt.supplier_lot.expiry_date,
    )
    db.add(internal_lot)

    # Update the receipt's remaining quantity
    locked_receipt.qty_remaining = locked_receipt.qty_remaining - payload.qty
    db.add(locked_receipt)
    db.flush()

    # Refresh to get the generated ID
    db.refresh(internal_lot)
    return internal_lot
