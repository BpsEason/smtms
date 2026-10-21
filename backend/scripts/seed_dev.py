"""Populate deterministic SMTMS development/test QA data.

Run from backend/: uv run python scripts/seed_dev.py

The seeder is idempotent and non-destructive. The guarded entry point owns
the single database transaction; data synchronization and validation live in
the seeder modules.
"""

from __future__ import annotations

import os
import sys
from urllib.parse import urlparse

from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from seeders.dev_data import SEED_REQUIRED_REVISION
from seeders.dev_sync import sync_seed
from seeders.dev_validation import validate_seed
from sqlalchemy import text


def _require_safe_environment() -> str:
    settings = get_settings()
    if settings.app_env.lower() not in {"development", "test"}:
        raise RuntimeError("Seeder is only allowed when APP_ENV is development or test.")

    parsed = urlparse(settings.database_url)
    database_name = parsed.path.lstrip("/")
    if parsed.scheme not in {"mysql", "mysql+pymysql"}:
        raise RuntimeError("Seeder only accepts the configured local MySQL database.")
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError(f"Refusing non-local database host: {parsed.hostname!r}.")
    if (parsed.port or 3306) != 3306 or database_name != "smtms":
        raise RuntimeError("Seeder is restricted to localhost:3306/smtms.")

    password = get_settings().smtms_seed_password or os.getenv("SMTMS_SEED_PASSWORD")
    if not password:
        raise RuntimeError("Set SMTMS_SEED_PASSWORD before running the development seeder.")
    if len(password) < 12:
        raise RuntimeError("SMTMS_SEED_PASSWORD must be at least 12 characters.")
    if len(password.encode("utf-8")) > 72:
        raise RuntimeError("SMTMS_SEED_PASSWORD must be at most 72 UTF-8 bytes for bcrypt.")

    with engine.connect() as connection:
        actual_database, actual_port = connection.execute(text("SELECT DATABASE(), @@port")).one()
        if actual_database != "smtms" or actual_port != 3306:
            raise RuntimeError(
                "Refusing unexpected live database target: "
                f"{actual_database!r} on port {actual_port}."
            )
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one_or_none()
        if revision != SEED_REQUIRED_REVISION:
            raise RuntimeError(
                f"Expected schema revision {SEED_REQUIRED_REVISION!r}, found {revision!r}."
            )
    return password


def main() -> int:
    try:
        password = _require_safe_environment()
        with SessionLocal() as session, session.begin():
            sync_seed(session, password)
            counts = validate_seed(session)
    except Exception as exc:
        print(f"Seeder aborted: {exc}", file=sys.stderr)
        return 1

    print("Development/test QA data seeded successfully.")
    for table, value in counts.items():
        print(f"{table}: {value}")
    print(
        "Quality scenarios: available/released, pending/quarantine, failed/rejected, "
        "split lots, and varied supplier certificate expiry."
    )
    print(
        "IQC sign-off examples: pending records plus any untouched approved/returned sample "
        "histories."
    )
    print(
        "Supplier portal accounts: seed_supplier_001..006 (role Supplier Portal User, "
        "forced password change on first login)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
