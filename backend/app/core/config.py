import json
from collections.abc import Callable
from functools import lru_cache
from typing import cast
from urllib.parse import quote, urlparse, urlunparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    app_name: str = Field(default="SMTMS")
    app_env: str = Field(default="development")
    app_debug: bool = Field(default=True)
    api_v1_str: str = Field(default="/api/v1")
    secret_key: str = Field(min_length=32)
    smtms_seed_password: str | None = Field(default=None)
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=60)
    database_url: str = Field(default="mysql+pymysql://root:root@localhost:3306/smtms")
    redis_url: str = Field(default="redis://localhost:6379/0")
    document_storage_dir: str = Field(default="var/documents")
    document_max_file_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    @field_validator("database_url", mode="before")
    @classmethod
    def sanitize_database_url(cls, value):
        if not isinstance(value, str):
            return value

        parsed = urlparse(value)
        if parsed.scheme not in {"mysql", "mysql+pymysql"} or not parsed.password:
            return value.strip()

        username = quote(parsed.username or "", safe="")
        password = quote(parsed.password, safe="")
        host = parsed.hostname or ""
        port = f":{parsed.port}" if parsed.port else ""
        path = parsed.path or ""
        return urlunparse(
            parsed._replace(
                netloc=f"{username}:{password}@{host}{port}",
                path=path,
            )
        )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if value is None:
            return ["http://localhost:5173"]
        if isinstance(value, str):
            parsed = value.strip()
            if not parsed:
                return ["http://localhost:5173"]
            if parsed.startswith("["):
                return json.loads(parsed)
            return [item.strip() for item in parsed.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    import os

    # 根據系統環境變數 APP_ENV 選擇要載入的環境檔案
    app_env = os.getenv("APP_ENV", "development")
    env_file = ".env.test" if app_env == "test" else ".env"

    settings_factory = cast(
        Callable[[], Settings],
        type(
            "EnvironmentSettings",
            (Settings,),
            {"model_config": {**Settings.model_config, "env_file": env_file}},
        ),
    )
    return settings_factory()
