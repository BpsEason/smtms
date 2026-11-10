"""SMTMS Backend Application Factory.

This module is the single entry point for assembling the FastAPI
application. It initializes logging, creates the application via the
``create_app`` factory, and exposes the ``app`` instance for ASGI
servers (uvicorn, etc.).
"""

from fastapi import FastAPI

from app.api.router import register_routers
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.lifespan import app_lifespan
from app.core.logging import init_logging
from app.middleware.registry import register_middlewares
from app.services import audit as _audit_service  # noqa: F401

# Initialize logging before any other module creates loggers
init_logging()

settings = get_settings()


def create_app() -> FastAPI:
    """Create and assemble the FastAPI application.

    Returns:
        FastAPI: Fully configured application with middleware,
        exception handlers, and routers registered.
    """
    app = FastAPI(
        title=settings.app_name,
        description="SMTMS backend API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=app_lifespan,
    )

    register_middlewares(app)
    register_exception_handlers(app)
    register_routers(app)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": "SMTMS backend is running"}

    return app


app = create_app()
