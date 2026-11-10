"""Tests for unified logging configuration.

Covers:
- Idempotent initialization (no duplicate handlers)
- Log format includes time, level, logger name, message
- Sensitive data is redacted
- Exception logging preserves traceback
- Request logging captures method, path, status, duration
"""

import io
import logging
import re
from collections.abc import Generator

import app.core.logging as logging_module
import pytest
from app.core.logging import (
    _RedactingFormatter,
    get_logger,
    init_logging,
    set_log_level,
)
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def reset_logging_state() -> Generator[None, None, None]:
    """Reset logging state between tests to ensure isolation."""
    logging_module._logging_initialized = False
    root = logging.getLogger()
    saved_handlers = root.handlers[:]
    for handler in root.handlers[:]:
        root.removeHandler(handler)
    yield
    logging_module._logging_initialized = False
    root = logging.getLogger()
    for handler in root.handlers[:]:
        root.removeHandler(handler)
    for h in saved_handlers:
        root.addHandler(h)


def test_init_logging_is_idempotent() -> None:
    """Calling init_logging multiple times should not create duplicate handlers."""
    init_logging()
    handlers_after_first = len(logging.getLogger().handlers)
    assert handlers_after_first == 1

    init_logging()
    handlers_after_second = len(logging.getLogger().handlers)
    assert handlers_after_second == 1


def test_log_format_includes_required_fields() -> None:
    """Log output must include timestamp, level, logger name, and message."""
    init_logging()
    logger = get_logger("test_format")
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(
        _RedactingFormatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root = logging.getLogger()
    root.addHandler(handler)
    try:
        logger.info("format-check-message")
        output = stream.getvalue()
    finally:
        root.removeHandler(handler)

    assert "format-check-message" in output
    assert "INFO" in output
    assert "test_format" in output
    assert re.search(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", output)


def test_sensitive_data_is_redacted() -> None:
    """Sensitive keywords in log messages should be redacted."""
    formatter = _RedactingFormatter(fmt="%(message)s")
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="User password=secret123 and token=abc-jwt",
        args=(),
        exc_info=None,
    )
    output = formatter.format(record)
    assert "secret123" not in output
    assert "abc-jwt" not in output
    assert "[REDACTED]" in output


def test_exception_logging_preserves_traceback() -> None:
    """logger.exception() should include traceback information."""
    logger = get_logger("test_traceback")
    records: list[logging.LogRecord] = []

    class CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = CaptureHandler(level=logging.DEBUG)
    logger.addHandler(handler)
    try:
        try:
            raise ValueError("boom")
        except ValueError:
            logger.exception("caught an error")
    finally:
        logger.removeHandler(handler)

    assert records, "Expected at least one log record"
    record = records[-1]
    assert record.exc_info is not None
    assert record.levelname == "ERROR"


def test_request_logging_captures_method_path_status() -> None:
    """HTTP middleware should log method, path, status code, and duration."""
    middleware_logger = logging.getLogger("app.middleware.http_logging")
    records: list[logging.LogRecord] = []

    class CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = CaptureHandler(level=logging.DEBUG)
    middleware_logger.addHandler(handler)
    try:
        client = TestClient(app)
        response = client.get("/")
    finally:
        middleware_logger.removeHandler(handler)

    assert response.status_code == 200
    messages = [r.getMessage() for r in records]
    assert any("GET" in msg and "/" in msg and "200" in msg for msg in messages), (
        f"Expected request log with method, path, and status; got: {messages}"
    )


def test_set_log_level_changes_runtime_level() -> None:
    """set_log_level should update the root logger level at runtime."""
    init_logging()
    set_log_level("DEBUG")
    assert logging.getLogger().level == logging.DEBUG
    set_log_level("WARNING")
    assert logging.getLogger().level == logging.WARNING


def test_default_log_level_is_info() -> None:
    """Default log level should be INFO."""
    init_logging()
    assert logging.getLogger().level == logging.INFO


def test_api_response_format_unchanged() -> None:
    """API response format must not be affected by logging changes."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "SMTMS backend is running"}


def test_http_status_code_unchanged() -> None:
    """HTTP status codes must not be affected by logging changes."""
    client = TestClient(app)
    response = client.get("/nonexistent-route-12345")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
