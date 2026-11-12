"""Exception handler registration for SMTMS Backend.

Provides a single function to register all global exception handlers
on a FastAPI application, keeping exception-handling logic separate
from application assembly.
"""

from app.core.logging import get_logger
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = get_logger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the application.

    - ``StarletteHTTPException``: returns consistent JSON error responses.
      Logs 5xx as errors; does NOT log expected 4xx (404, 400, 401, 403).
    - ``Exception``: catches unhandled exceptions, logs full traceback,
      and returns a generic 500 response.
    """

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
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
            headers=getattr(exc, "headers", None),
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
