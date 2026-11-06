from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.quality import MaterialORM, MaterialReceiptORM

from .iqc import router as iqc_router
from .lots import router as lots_router
from .receipts import router as receipts_router
from .reviews import router as reviews_router
from .traceability import router as traceability_router

router = APIRouter(tags=["quality"])

router.include_router(receipts_router)
router.include_router(lots_router)
router.include_router(iqc_router)
router.include_router(reviews_router)
router.include_router(traceability_router)


def get_material(
    material_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> MaterialORM:
    material = db.get(MaterialORM, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


def get_receipt(
    receipt_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> MaterialReceiptORM:
    receipt = db.get(MaterialReceiptORM, receipt_id)
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return receipt


def _coerce_decimal(value: Any, *, field_name: str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float, str)):
        try:
            return Decimal(str(value))
        except InvalidOperation as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}"
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}"
    )
