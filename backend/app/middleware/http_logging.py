"""HTTP Request Logging Middleware for FastAPI.

Records:
- HTTP Method
- Request Path
- Response Status Code
- Request execution time (milliseconds)

Log levels:
- INFO for normal requests
- ERROR for 5xx responses
- WARNING for 4xx responses (except known safe patterns like 404)

Sensitive data (passwords, tokens, JWT, Authorization headers, cookies) is
not logged.
"""

from __future__ import annotations

import time
import uuid
from typing import Awaitable, Callable

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

from app.core.logging import get_logger

logger = get_logger(__name__)

# Paths that should not be logged as warnings even if they return 4xx
# These represent expected client behavior, not system issues
_SAFE_4XX_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/auth/refresh",
    "/api/v1/auth/change-password",
}

# Headers that should never be logged
_SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
}


class HTTPLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs HTTP requests and responses."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[StarletteResponse]]
    ) -> StarletteResponse:
        # Generate a request ID for tracing
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id

        # Store start time
        start_time = time.perf_counter()

        # Get basic request info
        method = request.method
        path = request.url.path

        # Log the incoming request at DEBUG level (detailed)
        logger.debug(
            "Request %s: %s %s",
            request_id,
            method,
            path,
        )

        # Process the request
        try:
            response = await call_next(request)
        except Exception:
            # Re-raise to let FastAPI's exception handler deal with it.
            # The exception handler is responsible for logging the exception
            # to avoid duplicate logging.
            raise

        # Calculate execution time
        execution_time_ms = (time.perf_counter() - start_time) * 1000

        # Determine log level based on status code
        status_code = response.status_code

        if status_code >= 500:
            log_level = logger.error
        elif status_code >= 400:
            # Use WARNING only for unexpected 4xx; skip known safe paths
            if path in _SAFE_4XX_PATHS or path.startswith("/docs") or path.startswith("/redoc"):
                log_level = logger.debug
            else:
                log_level = logger.warning
        else:
            log_level = logger.info

        # Log the response
        log_level(
            "Request %s: %s %s -> %d (%.2fms)",
            request_id,
            method,
            path,
            status_code,
            execution_time_ms,
        )

        return response


def setup_http_logging(app: FastAPI) -> None:
    """Add HTTP logging middleware to the FastAPI application.

    Idempotent - can be called multiple times without adding duplicate middleware.
    """
    # Check if middleware is already added
    for middleware_row in app.user_middleware:
        if (
            hasattr(middleware_row, "cls")
            and middleware_row.cls is HTTPLoggingMiddleware
        ):
            return

    app.add_middleware(HTTPLoggingMiddleware)
