# SMTMS 後端

後端使用 FastAPI 提供 API，以 SQLAlchemy 操作 MySQL，並以 Alembic 管理資料庫結構。Python 相依套件由 `pyproject.toml` 宣告、`uv.lock` 鎖定，開發指令使用 `uv` 執行。

## 環境需求

- Python 3.12 以上且低於 3.14
- [uv](https://docs.astral.sh/uv/)
- 本機開發所需的 MySQL 與 Redis

## 安裝

在 PowerShell 中切換至後端目錄並安裝應用程式及開發相依套件：

```powershell
Set-Location 'C:\laragon\www\smtms\backend'
uv sync --group dev
```

`pyproject.toml` 是相依套件設定來源，`uv.lock` 記錄鎖定版本。修改相依套件後可更新鎖定檔：

```powershell
uv lock
```

檢查鎖定檔是否符合專案設定：

```powershell
uv lock --check
```

## 環境設定

設定檔範例為 `backend/.env.example`。建立本機 `backend/.env` 並填入有效設定；不要提交實際密碼或金鑰。常用變數如下：

- `APP_ENV`：執行環境。未設定時為 `development`；設為 `test` 時，設定載入器使用 `.env.test`。
- `DATABASE_URL`：SQLAlchemy MySQL 連線網址，格式如 `mysql+pymysql://使用者:密碼@127.0.0.1:3306/smtms`。作業系統環境變數會優先於環境檔。
- `REDIS_URL`：Redis 連線網址。
- `SECRET_KEY`：JWT 簽章金鑰，至少 32 個字元。
- `SMTMS_SEED_PASSWORD`：開發 Seeder 建立測試帳號使用的密碼，執行 Seeder 時必填，至少 12 個字元且 UTF-8 編碼最多 72 bytes。

MySQL 是外部服務，不由專案的 Compose 設定管理。若後端在 Docker 容器內連線到 Windows 主機上的 MySQL，`localhost` 指向容器本身；請在本機環境設定中使用可由容器連到的主機名稱（例如 `host.docker.internal`）。Seeder 僅允許本機 `localhost` 或 `127.0.0.1`，因此不能透過該 Seeder 對容器外的主機名稱執行。

## 專案結構

```text
backend/
├── app/                         # FastAPI 應用程式、API、模型、設定及服務
├── alembic/                     # Alembic 設定環境與資料庫遷移
│   └── versions/
├── scripts/
│   ├── seed_dev.py              # 受保護的開發／測試 Seeder 入口
│   └── generate_import_samples.py
├── seeders/
│   ├── dev_data.py              # 穩定識別碼、主檔與追溯資料及預期筆數
│   ├── dev_sync.py              # 開發帳號、主檔、收料、批次、IQC 與簽核資料同步
│   ├── dev_validation.py        # 整體筆數、權限與追溯關聯驗證
│   └── quality_abnormal/        # 品質異常案例資料及同步
│       ├── seeder.py
│       ├── cases_iqc.py
│       ├── cases_material.py
│       ├── cases_supplier.py
│       └── cases_traceability.py
└── tests/
    ├── test_seed_dev.py
    ├── test_quality_workflow_api.py
    ├── test_import_samples.py
    └── ...
```

`seed_dev.py` 負責環境與資料庫目標檢查、開啟單一資料庫交易、依序呼叫同步與驗證模組，以及輸出結果。案例模組只提供品質異常案件資料；`quality_abnormal/seeder.py` 使用既有 Seeder 建立的主檔、收料、批次、IQC 與使用者資料來建立關聯案件，不另行建立 Session 或提交交易。

## 資料庫遷移

從 `backend/` 套用目前所有 Alembic 遷移：

```powershell
uv run python -m alembic -c alembic.ini upgrade head
```

查看資料庫目前套用的版本：

```powershell
uv run python -m alembic -c alembic.ini current
```

目前唯一 migration head 為 `20261021_audit_logs`。Seeder 只接受此版本，不會執行資料庫遷移；應先自行套用遷移，再執行 Seeder。

## 啟動後端

```powershell
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

啟動後可在 `http://localhost:8000/docs` 開啟 FastAPI 互動式 API 文件。

## 登入與權限 API

- `POST /api/v1/auth/login`：使用帳號及密碼登入，成功後回傳 Bearer JWT。
- `POST /api/v1/auth/logout`：撤銷目前的 JWT；撤銷識別碼會存入 Redis，直到該 Token 到期。
- `GET /api/v1/auth/me`：回傳目前登入者資料，以及由 `user_roles`、`role_permissions` 即時解析的角色與權限。

登入密碼以 bcrypt 雜湊驗證。受保護 API 必須提供有效且未撤銷的 Token；若 Redis 無法提供 Token 撤銷檢查，API 會拒絕驗證，而不會略過檢查。授權依賴位於 `app.core.security`，包括 `get_current_user`、`require_role()` 與 `require_permission()`。

### Redis 非同步客戶端實作
專案已遷移至使用 `redis.asyncio` 非同步 Redis 客戶端，所有 Redis 相關操作皆需使用 `await`：
- 客戶端初始化：透過 `app.core.redis_client.init_redis_client()` 在 FastAPI lifespan 中初始化
- 資源清理：應用程式關閉時自動呼叫 `close_redis_client()` 釋放連線
- JWT 撤銷：`revoke_access_token()` 與 Token 驗證流程皆使用非同步 Redis 呼叫
- 健康檢查：`/health/ready` 與 `/health/redis` 端點使用非同步 ping 檢查 Redis 狀態
- Redis 不可用時的處理：所有依賴 Redis 的認證流程會回傳 503 Service Unavailable，確保安全性

## 開發／測試資料 Seeder

### 安全限制與交易

`scripts/seed_dev.py` 僅允許 `APP_ENV=development` 或 `test`，且只接受本機 `localhost:3306/smtms` 或 `127.0.0.1:3306/smtms`。它會連線確認實際資料庫、埠號及 `alembic_version` 為 `20261021_audit_logs`，並要求設定符合長度限制的 `SMTMS_SEED_PASSWORD`。任何檢查失敗都會停止執行。

同步資料與整體驗證由同一個 `SessionLocal` 工作階段及單一 `session.begin()` 交易包覆；不會在 Seeder 中執行遷移或刪除資料。發生錯誤時交易會回滾。

### 執行

在 `backend/` 設定本機 Seeder 密碼後執行：

```powershell
$env:SMTMS_SEED_PASSWORD = '設定至少 12 個字元的本機測試密碼'
uv run python scripts/seed_dev.py
```

Seeder 建立以下開發／測試帳號：

- `seed_admin`：管理者
- `seed_qa_1`、`seed_qa_2`：品保人員
- `seed_receiver_1`：收料人員
- `seed_supplier_001` 至 `seed_supplier_006`：各自關聯一家示範供應商的供應商入口帳號。帳號需首次登入更改密碼，且僅配置供應商入口角色。

Seeder 也建立 6 家供應商、12 種物料、24 筆供應商供貨關聯、6 份資格文件、20 筆供應商批次、20 筆收料、25 筆內部批次及 25 筆 IQC 紀錄；另建立 IQC 簽核範例與 12 筆品質異常案件。品質異常案件分為 IQC、材料、供應商及追溯四類，每類 3 筆，使用 Seeder 的真實主檔與追溯關聯。案件包含 `investigating`、`pending_confirmation`、`closed` 三種狀態，各 4 筆。

重複執行會依穩定業務識別碼同步 Seeder 管理的資料，避免重複建立；與非 Seeder 資料發生識別碼衝突時會停止而不覆寫。品質異常案件若已存在且內容符合案例資料會保留；若案件識別碼相同但內容不符，Seeder 會停止以避免覆寫。IQC 簽核歷程不會重設既有簽核決策。

上述帳號與資料僅供本機開發／測試使用，不可用於正式環境。

## 執行測試

執行全部後端測試：

```powershell
uv run pytest -q
```

僅執行 Seeder 測試：

```powershell
uv run pytest tests/test_seed_dev.py -q
```

`test_seed_dev.py` 使用 SQLite 測試資料庫驗證開發資料圖、關聯、重複執行及保護行為；執行這些測試不會連線至上述 MySQL 開發資料庫。品質異常 API 工作流程測試位於 `tests/test_quality_workflow_api.py`。

## 供應商匯入範例檔

產生 Excel 匯入範例檔（不需連線資料庫）：

```powershell
uv run python scripts/generate_import_samples.py
```

檔案會寫入 `backend/samples/`：

- `supplier_import_valid.xlsx`：3 筆可匯入的供應商（`DEMO-SUP-201` 至 `DEMO-SUP-203`），不與 Seeder 的 `SEED-*` 資料衝突。
- `supplier_import_errors.xlsx`：6 筆違反驗證規則的資料，涵蓋重複供應商編號、統一編號、登入帳號及必填欄位缺漏。

範例檔使用 `supplier_import.TEMPLATE_HEADERS` 產生，可用於匯入預覽／確認端點驗收。

## 程式碼檢查

檢查後端程式碼：

```powershell
uv run ruff check .
```