# SMTMS

SMTMS 是一個供應商、材料追溯與品質管理專案。此儲存庫包含 FastAPI 後端與 React + TypeScript 前端，用於供應商目錄管理、收料登錄、內部批號分割以及 IQC 流程。

## 1. 專案概覽

目前程式碼已實作以下功能範圍：

- 身分驗證與 RBAC 權限檢查（登入、登出、使用者資料查詢、權限控管路由）
- 供應商與材料目錄管理
- 供應商-材料關聯與供應商批號參考
- 材料收料登錄與剩餘數量追蹤
- 從收料建立內部批號
- IQC 紀錄建立與更新流程
- 前端登入流程、儀表板、供應商/材料畫面、收料畫面與 IQC 管理介面

並非所有規劃中的功能都已在目前程式碼中實作；本 README 僅反映此儲存庫中實際存在的程式碼與設定。

## 2. 技術架構

- 後端：FastAPI、Python 3.12+、SQLAlchemy 2.x、Alembic、uv
- 前端：React 19、TypeScript、Vite、React Router
- 資料庫：MySQL（由外部環境提供，不由 Docker Compose 管理）
- 快取 / Token 撤銷：Redis（後端驗證與健康檢查使用）
- 部署層：Docker Compose + Nginx
- 測試與程式碼檢查：pytest、ruff、Vitest、TypeScript build

## 3. 儲存庫結構

```text
SMTMS/
├── README.md
├── docker-compose.yml
├── docker/
│   └── nginx/
│       └── default.conf
├── backend/
│   ├── .env.example
│   ├── .env
│   ├── Dockerfile
│   ├── README.md
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   └── __init__.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── redis_client.py
│   │   │   └── security.py
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   └── __init__.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── quality.py
│   │   │   └── user.py
│   │   ├── schemas/
│   │   │   ├── auth.py
│   │   │   └── catalog.py
│   │   └── services/
│   ├── scripts/
│   │   └── seed_dev.py
│   ├── tests/
│   │   ├── test_catalog_api.py
│   │   ├── test_infrastructure.py
│   │   ├── test_jwt_rbac.py
│   │   ├── test_quality_workflow_api.py
│   │   └── test_smoke.py
│   └── check_mysql_comments.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── public/
│   └── src/
│       ├── App.tsx
│       ├── App.css
│       ├── App.test.tsx
│       ├── api/
│       │   └── client.ts
│       ├── index.css
│       ├── main.tsx
│       ├── test/
│       │   └── setup.ts
│       ├── types.ts
│       └── vite-env.d.ts
└── package.json
```

## 4. 已實作功能

此專案目前在已提交的程式碼中包含以下功能：

### 身分驗證與授權

- 使用帳號/密碼的登入端點，並產生 JWT
- 登出端點，會將目前 token 在 Redis 中撤銷
- 目前使用者資料端點，以及從資料庫角色/權限解析權限
- 使用 `require_permission()` 與 `require_role()` 進行 RBAC 檢查

### 供應商與材料目錄

- 供應商列表、詳細資料與目錄 API
- 材料列表、詳細資料與目錄 API
- 供應商-材料關聯支援

### 收料與批號流程

- 材料收料建立
- 收料列表與詳細查詢
- 收料剩餘數量追蹤
- 從收料建立內部批號
- 內部批號列表與詳細查詢

### IQC 流程

- IQC 紀錄建立
- IQC 紀錄更新
- 根據檢驗結果與放行狀態更新內部批號狀態
- 前端用於建立與更新 IQC 紀錄的流程畫面

### 前端畫面

- 登入畫面
- 受保護路由與 session 處理
- 儀表板摘要畫面
- 供應商與材料列表畫面
- 收料管理畫面
- 內部批號管理畫面
- IQC 管理畫面

請以程式碼為準。任何未來功能若未出現在目前的路由、schema 或前端畫面中，應視為尚未實作。

## 5. 需求與安裝

本專案主要在 Windows 環境開發，並使用 PowerShell 指令。

### 安裝 Python 工具

```powershell
powershell -NoProfile -Command "python -m pip install uv"
```

### 安裝後端依賴

```powershell
cd backend
uv sync --group dev
```

後端宣告的依賴來源為 `pyproject.toml`，鎖定檔為 `uv.lock`。

## 6. 環境變數與資料庫設定

### 後端環境

修改前請先複製範例設定：

```powershell
cd backend
copy .env.example .env
```

目前後端實際使用的環境變數為：

- `APP_ENV`
- `APP_NAME`
- `APP_DEBUG`
- `API_V1_STR`
- `SECRET_KEY`
- `ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ORIGINS`

`.env.example` 中的變數名稱即為應用程式目前使用的名稱，請勿自行發明新變數。

### MySQL 為外部資料庫

此儲存庫的 `docker-compose.yml` 不會建立或管理 MySQL。應用程式啟動前，資料庫必須已經存在。

- 請在外部 MySQL 環境中建立資料庫與權限。
- 在 `DATABASE_URL` 中設定正確的主機、連接埠、資料庫名稱、使用者與密碼。
- 請勿將真實憑證存放於儲存庫中。
- 請勿提交 `.env` 檔案或真實密鑰。

### Docker 與本機主機的差異

當後端在 Docker 中執行，而資料庫位於 Windows 主機時，容器內的 `localhost` 會指向容器本身，而非主機。此時請使用 Docker 主機別名：

```text
host.docker.internal
```

範例：

- 本機後端直接在 Windows 主機執行：
  - 使用本機程序可連線的主機資料庫位址
- 後端在 Docker 容器中連線到 Windows 主機的 MySQL：
  - 在 `DATABASE_URL` 中使用 `host.docker.internal`
- Redis 在 Docker Compose 中：
  - 從後端容器使用 `redis://redis:6379/0`
- Redis 在本機執行：
  - 使用你在 Compose 外設定的本機 Redis 主機位址

## 7. 資料庫遷移與 Schema 更新

此儲存庫在 `backend/alembic/` 下包含 Alembic 設定與遷移檔案。

從後端目錄套用遷移：

```powershell
cd backend
uv run python -m alembic -c alembic.ini upgrade head
```

檢查目前遷移版本：

```powershell
cd backend
uv run python -m alembic -c alembic.ini current
```

後端也包含一個針對 MySQL 的驗證腳本：

```powershell
cd backend
uv run python check_mysql_comments.py
```

注意：本專案設定為使用 MySQL 後端的 schema，但資料庫本身位於 Docker Compose 堆疊之外。

## 8. Seeder 與開發資料

專案包含種子腳本：`backend/scripts/seed_dev.py`。

從後端目錄執行：

```powershell
cd backend
uv run python scripts/seed_dev.py
```

此種子腳本僅適用於開發或測試資料庫。它會建立或更新帶有專案特定種子前綴的紀錄，且應在確認目標資料庫正確後才執行。

腳本也支援透過環境變數覆寫密碼：

```powershell
$env:SMTMS_SEED_PASSWORD = "your-local-seed-password"
```

共用的種子密碼記錄於後端 README，但實際值不應提交至原始碼控管或公開輸出。

## 9. 本機開發流程

### 後端

直接在主機上執行 API：

```powershell
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

執行完整後端測試套件：

```powershell
cd backend
uv run pytest
```

執行 Ruff 檢查：

```powershell
cd backend
uv run ruff check .
```

檢查 lock 一致性：

```powershell
cd backend
uv lock --check
```

當依賴設定變更時，更新 lock 檔：

```powershell
cd backend
uv lock
```

### 前端

安裝前端依賴：

```powershell
cd frontend
npm install
```

執行前端開發伺服器：

```powershell
cd frontend
npm run dev
```

執行前端測試：

```powershell
cd frontend
npm test
```

執行前端建置：

```powershell
cd frontend
npm run build
```

執行前端 linter：

```powershell
cd frontend
npm run lint
```

## 10. Docker 部署

Compose 堆疊管理以下服務：

- backend
- frontend
- Redis
- Nginx

compose 檔位於專案根目錄：

```powershell
cd C:\laragon\www\smtms
docker compose up --build
```

重要事項：

- MySQL 為外部資料庫，此專案的 Docker Compose 不會建立它。
- 後端容器必須使用正確的主機值才能連線到外部資料庫。
- Redis 是由 Compose 管理的容器內依賴。
- Nginx 會將 `/api/` 流量導向後端容器，其餘導向前端容器。

目前 compose 設定的連接埠：

- Backend：`8000`
- Frontend：`5173`
- Redis：`6379`
- Nginx：`80`

檢視服務狀態與日誌：

```powershell
cd C:\laragon\www\smtms
docker compose ps
docker compose logs backend
docker compose logs frontend
docker compose logs redis
docker compose logs nginx
```

停止堆疊：

```powershell
cd C:\laragon\www\smtms
docker compose down
```

除非你有意重置可拋棄的開發資料庫，否則請勿執行破壞性的資料庫清理指令。

## 11. API 與驗證

後端在設定中定義的 API 前綴下註冊路由：

```text
/api/v1
```

應用程式提供 FastAPI Swagger / OpenAPI 文件於：

```text
http://localhost:8000/docs
```

專案中已實作的健康檢查端點包含：

- `/api/v1/health`
- `/api/v1/health/live`
- `/api/v1/health/ready`
- `/api/v1/health/database`
- `/api/v1/health/redis`
- `/ready`

### 目前工作區中的驗證結果

以下指令已在目前工作區執行並成功：

```powershell
cd backend
uv run pytest -q
```

```powershell
cd frontend
npm run build
```

```powershell
cd frontend
npm test
```

這些結果確認後端測試套件與前端建置/測試流程在目前簽出的工作區中均可通過。

## 12. 疑難排解

### MySQL 連線失敗

- 確認資料庫已存在，且使用者擁有必要權限。
- 確認 `DATABASE_URL` 中設定了正確的主機/連接埠。
- 若後端在 Docker 中執行，而資料庫位於主機，請使用 `host.docker.internal` 而非 `localhost`。

### Redis 連線失敗

- 確認 Redis 正在執行。
- 對於基於 Compose 的執行，從後端容器使用 `redis://redis:6379/0`。
- 對於本機執行，使用你為本機環境設定的 Redis 主機位址。

### 環境變數缺失

- 將 `backend/.env.example` 複製為 `backend/.env` 並設定必要值。
- 確認 `SECRET_KEY` 設定為足夠長的值。
- 確認 `DATABASE_URL` 與 `REDIS_URL` 符合應用程式執行的環境。

### Lock 檔不一致

```powershell
cd backend
uv lock --check
```

若失敗，使用以下指令更新 lock 檔：

```powershell
cd backend
uv lock
```

### 前端無法連線到後端 API

- 確認前端的 API base URL 與後端位址相符。
- 檢查後端設定中的 CORS 設定。
- 確認後端正在執行，且 API 前綴正確。

## 13. 注意事項

本 README 刻意與目前已提交的專案結構與執行時設定保持一致。它不描述推測性功能或未記錄的未來計畫。若某項功能未出現在路由定義、schema、前端檔案或測試中，就不應被描述為已實作。