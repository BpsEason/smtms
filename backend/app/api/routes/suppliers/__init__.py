"""Suppliers API routes module."""

from fastapi import APIRouter

from app.api.routes.suppliers.documents import router as documents_router
from app.api.routes.suppliers.imports import router as imports_router
from app.api.routes.suppliers.materials import router as materials_router
from app.api.routes.suppliers.suppliers import router as suppliers_router

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

router.include_router(imports_router)
router.include_router(documents_router)
router.include_router(materials_router)
router.include_router(suppliers_router)

__all__ = ["router"]
