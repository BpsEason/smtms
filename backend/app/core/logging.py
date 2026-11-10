"""Unified logging configuration for SMTMS Backend.

Provides a consistent logging setup with:
- Single handler registration to avoid duplicate logs
- Structured format: time | level | module | message
- Configurable log level via settings
- Idempotent initialization
"""

from __future__ import annotations

import logging
import sys

from app.core.config import get_settings

# Module-level flag to track if logging has been initialized
_logging_initialized = False


class _RedactingFormatter(logging.Formatter):
    """Logging formatter that redacts sensitive information."""

    SENSITIVE_PATTERNS = (
        "password",
        "token",
        "secret",
        "authorization",
        "cookie",
        "jwt",
        "refresh_token",
        "access_token",
    )

    def _redact_value(self, msg: str) -> str:
        """Replace sensitive values with [REDACTED]."""
        if not isinstance(msg, str):
            return str(msg)
        lower_msg = msg.lower()
        for pattern in self.SENSITIVE_PATTERNS:
            if pattern in lower_msg:
                msg = msg.replace(pattern, "[REDACTED]")
        return msg

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record with redaction.

        Redacts sensitive patterns from the final formatted message to avoid
        double-formatting issues with record.args.
        """
        formatted = super().format(record)
        return self._redact_value(formatted)


def _setup_logging() -> None:
    """Configure root logger with a single StreamHandler to stdout.

    This function is idempotent - calling it multiple times will not
    create duplicate handlers.
    """
    global _logging_initialized

    if _logging_initialized:
        return

    settings = get_settings()
    log_level_str = getattr(settings, "log_level", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    # Create a StreamHandler that writes to stdout
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    # Create formatter: time | level | module | message
    formatter = _RedactingFormatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove any existing handlers to prevent duplicates
    for existing_handler in root_logger.handlers[:]:
        root_logger.removeHandler(existing_handler)

    root_logger.addHandler(handler)

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    _logging_initialized = True


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name.

    Uses logging.getLogger(__name__) pattern for proper module-level logging.
    Ensures logging is initialized before returning the logger.

    Args:
        name: Usually __name__ from the calling module.

    Returns:
        logging.Logger: Configured logger instance.
    """
    _setup_logging()
    return logging.getLogger(name)


def init_logging() -> None:
    """Initialize logging. Can be called multiple times safely."""
    _setup_logging()


def is_logging_initialized() -> bool:
    """Check if logging has been initialized."""
    return _logging_initialized


def set_log_level(level: str | int) -> None:
    """Dynamically change the log level at runtime.

    Args:
        level: Log level as string (e.g., 'DEBUG', 'INFO') or numeric value.
    """
    if isinstance(level, str):
        numeric_level = getattr(logging, level.upper(), None)
        if numeric_level is None:
            raise ValueError(f"Unknown log level: {level}")
    else:
        numeric_level = level

    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    for handler in root_logger.handlers:
        handler.setLevel(numeric_level)
