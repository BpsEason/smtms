from collections.abc import Generator

import pytest
from app.core import redis_client as redis_module
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool


class _FakeRedis:
    """測試用 Redis Mock。"""

    async def exists(self, key: str) -> int:
        return 0

    async def set(self, key: str, value: str, ex: int) -> bool:
        return True

    async def close(self) -> None:
        return None


@pytest.fixture(scope="session")
def engine():
    """整個測試 Session 共用 SQLite Engine，只建立一次資料表。"""

    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # 停用 sqlite3 預設的隱式交易控制。
    @event.listens_for(test_engine, "connect")
    def disable_implicit_transaction(dbapi_connection, connection_record):
        dbapi_connection.isolation_level = None

    # 明確啟動 SQLite 交易，確保 SAVEPOINT 可以正確回滾。
    @event.listens_for(test_engine, "begin")
    def explicit_begin(connection):
        connection.exec_driver_sql("BEGIN")

    Base.metadata.create_all(test_engine)

    yield test_engine

    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture
def db_session(engine) -> Generator[Session, None, None]:
    """每個測試使用獨立外層交易，透過 SAVEPOINT 保持資料隔離。"""

    connection = engine.connect()
    transaction = connection.begin()

    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[TestClient, None, None]:
    """建立測試用 TestClient，注入資料庫與 Redis Mock。"""

    monkeypatch.setattr(
        redis_module,
        "get_redis_client",
        lambda: _FakeRedis(),
    )

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    # 保留原本的 Dependency Overrides，避免測試之間互相影響。
    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)
