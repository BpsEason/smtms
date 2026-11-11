"""Router registration for SMTMS Backend.

Centralizes the registration of all API routers on a FastAPI application,
using the configured API v1 prefix.
"""

from fastapi import FastAPI

from app.api.routes.access import router as access_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.health import router as health_router
from app.api.routes.materials import router as materials_router
from app.api.routes.nonconformances import router as nonconformances_router
from app.api.routes.quality import router as quality_router
from app.api.routes.suppliers import router as suppliers_router
from app.core.config import get_settings


def register_routers(app: FastAPI) -> None:
    """Register all API routers on the application.

    All routers are mounted under the configured API v1 prefix.
    """
    settings = get_settings()

    app.include_router(health_router, prefix=settings.api_v1_str)
    app.include_router(auth_router, prefix=settings.api_v1_str)
    app.include_router(access_router, prefix=settings.api_v1_str)
    app.include_router(audit_router, prefix=settings.api_v1_str)
    app.include_router(dashboard_router, prefix=settings.api_v1_str)
    app.include_router(suppliers_router, prefix=settings.api_v1_str)
    app.include_router(materials_router, prefix=settings.api_v1_str)
    app.include_router(quality_router, prefix=settings.api_v1_str)
    app.include_router(nonconformances_router, prefix=settings.api_v1_str)
