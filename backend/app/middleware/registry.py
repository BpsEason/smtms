"""Middleware registration for SMTMS Backend.

Centralizes the registration of all middleware on a FastAPI application,
preserving the same execution order as the original inline registration.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.middleware.http_logging import setup_http_logging


def register_middlewares(app: FastAPI) -> None:
    """Register all middleware on the application.

    Order matters: CORSMiddleware is added first, then HTTPLoggingMiddleware
    is added second. In FastAPI, later-added middleware wraps earlier-added
    middleware, so HTTPLoggingMiddleware executes outermost (first on the
    way in, last on the way out), while CORSMiddleware executes inside it.
    This preserves the original execution order.
    """
    settings = get_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # HTTP logging middleware is added after CORS so it wraps CORS,
    # matching the original behavior where setup_http_logging was called
    # after all routes were registered.
    setup_http_logging(app)
