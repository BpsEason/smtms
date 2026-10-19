from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.materials import router as materials_router
from app.api.routes.quality import router as quality_router
from app.api.routes.suppliers import router as suppliers_router
from app.core.config import get_settings
from app.core.redis_client import close_redis_client, init_redis_client

settings = get_settings()


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    init_redis_client()
    try:
        yield
    finally:
        close_redis_client()


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


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SMTMS backend is running"}


app.include_router(health_router, prefix=settings.api_v1_str)
app.include_router(auth_router, prefix=settings.api_v1_str)
app.include_router(suppliers_router, prefix=settings.api_v1_str)
app.include_router(materials_router, prefix=settings.api_v1_str)
app.include_router(quality_router, prefix=settings.api_v1_str)
