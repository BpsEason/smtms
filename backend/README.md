# SMTMS 後端

本目錄包含 SMTMS 後端服務，使用 FastAPI 提供 API，並以 SQLAlchemy 與 Alembic 管理資料庫模型及結構遷移。Python 套件依賴統一由 uv 與 `pyproject.toml` 管理。

## 環境需求

- Python 3.12 以上，且低於 3.14
- [uv](https://docs.astral.sh/uv/)
- 本機開發所需的 MySQL 與 Redis 服務

## 安裝依賴

在專案根目錄執行：

```powershell
Set-Location 'C:\laragon\www\smtms\backend'
uv sync --group dev
```

## 依賴管理

`pyproject.toml` 是 Python 依賴的主要設定來源，`uv.lock` 用來鎖定實際套件版本。

更新鎖定檔：

```powershell
uv lock
```

檢查鎖定檔是否與依賴設定一致：

```powershell
uv lock --check
```

## 環境設定

後端從 `backend/.env` 載入設定。請依照本機服務調整資料庫與 Redis 連線資訊。範例設定可參考 `.env.example`。

常用設定：

- `APP_ENV`：執行環境，例如 `development` 或 `test`
- `DATABASE_URL`：MySQL 連線網址；MySQL 為外部資料庫，不由 Compose 管理
- `REDIS_URL`：Redis 連線網址
- `SECRET_KEY`：JWT 簽章金鑰；正式環境必須使用安全且獨立的值

請自行產生至少 32 個字元的隨機 `SECRET_KEY`，並放在本機 `.env`；程式不提供內建簽章金鑰。

當後端在 Docker 容器內連線到 Windows 主機上的 MySQL 時，`localhost` 會指向容器本身，應改為 `host.docker.internal`，並由環境變數設定實際資料庫主機、埠號、資料庫名稱、使用者與密碼，不要將真實密碼寫死在版本控制或 Compose 設定中。

## 資料庫遷移

套用目前所有 Alembic 遷移：

```powershell
uv run python -m alembic -c alembic.ini upgrade head
```

查看目前資料庫遷移版本：

```powershell
uv run python -m alembic -c alembic.ini current
```

**注意：**若要重建資料表，可以執行 `uv run python -m alembic -c alembic.ini downgrade base`，再執行 `uv run python -m alembic -c alembic.ini upgrade head`。降級會刪除 Alembic 管理的資料表及其中資料，請勿在需要保留資料的資料庫執行。

## 啟動後端

```powershell
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

開發伺服器啟動後，可開啟 `http://localhost:8000/docs` 查看 FastAPI 互動式 API 文件。

## 登入與權限 API

- `POST /api/v1/auth/login`：使用帳號及密碼登入，成功後回傳 Bearer JWT。
- `POST /api/v1/auth/logout`：撤銷目前的 JWT；撤銷識別碼會存入 Redis，直到該 Token 到期。
- `GET /api/v1/auth/me`：回傳目前登入者資料，以及由 `user_roles`、`role_permissions` 即時解析的角色與權限。

登入密碼以 bcrypt 雜湊驗證。受保護 API 必須提供有效且未撤銷的 Token；若 Redis 無法提供 Token 撤銷檢查，API 會拒絕驗證，而不會略過檢查。後續 API 可使用 `app.core.security` 的 `get_current_user`、`require_role()` 與 `require_permission()` 授權依賴。

## 執行測試

```powershell
uv run pytest -q
```

## 填入開發／測試品保資料

Seeder 只允許在 `APP_ENV=development` 或 `test` 環境中，連線至本機 `localhost:3306/smtms`，且資料庫必須位於預期的 Alembic 遷移版本。它只會替換以 `SEED-`／`seed_` 為識別的測試資料，不會刪除資料表，也不會執行資料庫遷移。

執行 Seeder：

```powershell
uv run python scripts/seed_dev.py
```

所有 Seeder 測試帳號共用本機測試密碼：`SmtmsLocal2026!`。測試帳號如下：

- `seed_admin`：開發測試管理者
- `seed_qa_1`：品保人員
- `seed_qa_2`：備援品保人員
- `seed_receiver_1`：收料人員

上述帳號及密碼僅供本機開發／測試使用，不可用於正式環境。Seeder 仍會檢查執行環境及資料庫目標；如需覆寫測試密碼，可在目前的 PowerShell 工作階段設定 `SMTMS_SEED_PASSWORD` 環境變數。

## 程式碼檢查

檢查後端程式碼：

```powershell
uv run ruff check .
```
