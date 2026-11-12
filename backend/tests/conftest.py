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


class FakeRedis:
    """測試用集中式 Redis Mock。

    使用 instance-level store 與 ttl 字典，確保每個測試實例互相隔離。
    注意：本實作僅為記憶體 Mock，不具備真實時間流逝之 TTL 自動淘汰能力，
    且 eval() 僅以 Python 模擬原子計數邏輯，不可宣稱已驗證真實 Redis Lua 引擎之原子性。
    """

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._ttl: dict[str, int] = {}
        self.store = self._store
        self.ttl = self._ttl
        self.revoked: set[str] = set()
        self.eval_calls: list[str] = []

    async def exists(self, key: str) -> int:
        if key in self.revoked:
            return 1
        return 1 if key in self._store else 0

    async def set(self, key: str, value: str, ex: int | None = None, *args, **kwargs) -> bool:
        if value == "1" and key.startswith("auth:revoked:"):
            self.revoked.add(key)
        self._store[key] = str(value)
        if ex is not None:
            self._ttl[key] = int(ex)
        return True

    async def eval(self, script: str, numkeys: int, key: str, *args) -> list[int]:
        # 嚴格對照 app/core/login_rate_limit.py 之 _RATE_LIMIT_LUA 腳本參數與行為
        assert numkeys == 1
        self.eval_calls.append(script)
        ttl = int(args[1]) if len(args) > 1 else 0
        current = int(self._store.get(key, "0"))
        if current == 0:
            self._ttl[key] = ttl
        count = current + 1
        self._store[key] = str(count)
        remaining = self._ttl.get(key, ttl)
        if remaining < 0:
            self._ttl[key] = ttl
            remaining = ttl
        return [count, remaining]

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


# 保留向後相容別名
_FakeRedis = FakeRedis


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
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    """提供每個測試獨立的 FakeRedis 實例並注入 redis_client 模組。"""

    instance = FakeRedis()
    monkeypatch.setattr(
        redis_module,
        "get_redis_client",
        lambda: instance,
    )
    return instance


@pytest.fixture
def client(
    db_session: Session,
    fake_redis: FakeRedis,
) -> Generator[TestClient, None, None]:
    """建立測試用 TestClient，注入資料庫與 Redis Mock。"""

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
