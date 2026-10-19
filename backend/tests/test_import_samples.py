"""Verify the delivered supplier-import sample workbooks against the real rules.

The sample files under ``backend/samples/`` are standalone acceptance fixtures
for the Excel import flow. These tests load the committed files and run them
through the production parser/validator so the samples cannot silently drift
from the real template.
"""

from collections.abc import Generator
from pathlib import Path

import pytest
from app.db.base import Base
from app.services import supplier_import
from scripts import generate_import_samples
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

SAMPLE_DIR: Path = generate_import_samples.SAMPLE_DIR


@pytest.fixture
def empty_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with TestSession() as session, session.begin():
            yield session
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def _load(filename: str) -> bytes:
    path = SAMPLE_DIR / filename
    assert path.exists(), (
        f"Missing sample file {path}. "
        "Run `uv run python scripts/generate_import_samples.py` to create it."
    )
    return path.read_bytes()


def _validate(content: bytes, session: Session) -> supplier_import.ValidationOutcome:
    parsed = supplier_import.parse_supplier_workbook(content)
    return supplier_import.validate_supplier_rows(session, parsed)


def test_valid_sample_workbook_passes_every_row(empty_session: Session) -> None:
    content = _load(generate_import_samples.VALID_FILENAME)
    outcome = _validate(content, empty_session)

    assert outcome.total_rows == 3
    assert outcome.errors == []
    assert outcome.skipped_rows == []
    assert {row.supplier_code for row in outcome.rows} == {
        "DEMO-SUP-201",
        "DEMO-SUP-202",
        "DEMO-SUP-203",
    }
    assert all(row.login_username for row in outcome.rows)
    assert all(row.login_password is None for row in outcome.rows)


def test_valid_sample_does_not_collide_with_seed_prefixes(empty_session: Session) -> None:
    from scripts import seed_dev

    content = _load(generate_import_samples.VALID_FILENAME)
    outcome = _validate(content, empty_session)

    for row in outcome.rows:
        assert not row.supplier_code.startswith(seed_dev.SEED_SUPPLIER_PREFIX)
        assert not row.login_username.startswith(seed_dev.SEED_SUPPLIER_USER_PREFIX)


def test_error_sample_workbook_covers_expected_rules(empty_session: Session) -> None:
    content = _load(generate_import_samples.ERROR_FILENAME)
    outcome = _validate(content, empty_session)

    assert outcome.total_rows == 6
    fields = {error.field for error in outcome.errors}
    # duplicate supplier_code / tax_id / login_username and missing required fields
    assert {"supplier_code", "tax_id", "login_username", "supplier_name"} <= fields

    # only the first row is clean; the remaining rows each break one rule
    assert [row.supplier_code for row in outcome.rows] == ["DEMO-ERR-301"]
    assert len(outcome.errors) >= 5
    assert all(error.row >= 2 for error in outcome.errors)
