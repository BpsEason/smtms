from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.access import router as access_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.materials import router as materials_router
from app.api.routes.nonconformances import router as nonconformances_router
from app.api.routes.quality import router as quality_router
from app.api.routes.suppliers import router as suppliers_router
from app.core.config import get_settings
from app.core.logging import get_logger, init_logging
from app.core.redis_client import close_redis_client, init_redis_client
from app.services import audit as _audit_service  # noqa: F401

# Initialize logging first
init_logging()
logger = get_logger(__name__)

settings = get_settings()


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    await init_redis_client()
    try:
        yield
    finally:
        await close_redis_client()


app = FastAPI(
    title=settings.app_name,
    description="SMTMS backend API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handler for HTTP exceptions.

    Logs 5xx HTTP exceptions as errors, but does NOT log expected 4xx
    (like 404, 400, 401, 403) as errors since those are expected behavior.
    """
    if exc.status_code >= 500:
        logger.error(
            "HTTP %d for %s %s: %s",
            exc.status_code,
            request.method,
            request.url.path,
            exc.detail,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler for unhandled exceptions.

    Logs the full traceback and returns a consistent error response.
    Only catches non-HTTP exceptions; HTTP exceptions are handled above.
    """
    # Log unhandled exceptions with full traceback
    logger.exception(
        "Unhandled exception for %s %s",
        request.method,
        request.url.path,
    )

    # Return a generic error response (don't leak internal details)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SMTMS backend is running"}


app.include_router(health_router, prefix=settings.api_v1_str)
app.include_router(auth_router, prefix=settings.api_v1_str)
app.include_router(access_router, prefix=settings.api_v1_str)
app.include_router(audit_router, prefix=settings.api_v1_str)
app.include_router(suppliers_router, prefix=settings.api_v1_str)
app.include_router(materials_router, prefix=settings.api_v1_str)
app.include_router(quality_router, prefix=settings.api_v1_str)
app.include_router(nonconformances_router, prefix=settings.api_v1_str)

# Setup HTTP logging middleware (must be done after routes are registered)
from app.middleware.http_logging import setup_http_logging  # noqa: E402

setup_http_logging(app)
