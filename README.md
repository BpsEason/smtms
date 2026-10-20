# SMTMS — Supplier Material Traceability Management System

![CI](https://github.com/BpsEason/smtms/actions/workflows/ci.yml/badge.svg)

SMTMS 是一個製造業供應商、物料與進料品質管理示範系統。它把供應商及供料關係、供應商批號、收料、內部批號、IQC 檢驗與品質異常記錄連成可查詢的資料流程，協助使用者追查物料來源與品質處理歷程。

此專案展示 FastAPI 後端、關聯式資料建模、流程與數量驗證、RBAC 權限控制，以及前後端測試和 CI。專案定位為可在本機操作的工程作品，不代表已完成正式生產環境認證或負載驗證。

## Demo

目前 README 尚無實際執行畫面。之後可在此補上由本機 Demo 擷取的真實畫面；不使用合成介面圖片。

本機 Demo 可由登入頁開始，依權限操作供應商、物料、收料、內部分批、IQC、品質異常、追溯與角色管理。初始化帳號由 Seeder 建立，密碼由本機環境變數 `SMTMS_SEED_PASSWORD` 設定（請勿在 README 或 Git 提交密碼）。

## 功能與實作範圍

| 功能 | 已實作內容 | 程式碼／驗證依據 |
| --- | --- | --- |
| 供應商與物料管理 | 供應商及物料主檔、供應商供料關聯；供應商資格文件與受控附件 API；另有供應商 Excel 匯入預覽與確認 API | `backend/app/api/routes/suppliers.py`、`materials.py`、`backend/tests/test_catalog_api.py`、`test_supplier_import.py` |
| 收料與批號管理 | 建立供應商批號及收料；收料驗證批號關聯與申報剩餘量；收料可拆分為多個內部批號，並驗證可拆數量 | `backend/app/api/routes/quality.py`、`backend/tests/test_quality_workflow_api.py` |
| 進料檢驗（IQC） | IQC 紀錄建立與更新、受規則限制的檢驗狀態；另提供品保審核清單、核准／退回及審核歷程，退回需理由 | `quality.py`、`backend/tests/test_quality_workflow_api.py` |
| 品質異常管理 | 異常案件查詢、建立與更新、調查狀態流轉、處置紀錄、歷程及受控附件；可連結供應商、物料、收料、批號或 IQC | `backend/app/api/routes/nonconformances.py`、`backend/app/models/quality.py`、`backend/tests/test_quality_workflow_api.py` |
| 物料追溯 | 以供應商批號、收料單、內部批號、IQC ID 或物料代碼查詢關聯流程；結果分頁，前端 CSV 匯出目前結果頁 | `quality.py` 的 `/traceability`、`frontend/src/pages/TraceabilityPage.tsx`、`test_quality_workflow_api.py` |
| 角色與權限管理 | 使用者、角色、權限及角色指派 API；前端依權限保護頁面，後端 API 另行授權；供應商帳號依綁定的供應商範圍隔離 | `backend/app/api/routes/access.py`、`backend/app/core/security.py`、`frontend/src/App.tsx`、`backend/tests/test_access_control_api.py`、`test_supplier_isolation.py` |

以上列出程式碼與測試中可查證的範圍。附件目前存於後端設定的本機持久化目錄，限制格式與大小；尚未包含病毒掃描或外部物件儲存。CSV 僅匯出當前頁。正式部署、長時間負載與合規認證尚未完成。

## 核心設計

- **資料關聯：** `supplier_materials` 描述供應商供料關係；`supplier_lots`、`material_receipts`、`internal_material_lots`、`iqc_records` 逐層連結物料來源、收料、內部分批與檢驗；`quality_reviews` 保存 IQC 核准／退回決策歷程。
- **流程約束：** 收料累計量不可超過供應商批號申報量，內部拆批不可超過收料剩餘量；建立關聯紀錄時會檢查連結對象是否一致。
- **權限邊界：** API 以權限依賴檢查操作權限，供應商帳號依 `supplier_id` 限制資料範圍。前端路由權限檢查用於介面導覽，後端仍負責 API 授權。
- **異常與審核歷程：** IQC 審核決策另存為歷程；異常案件保留變更歷程及處置紀錄，並可關聯至追溯資料。

## 技術架構與堆疊

```mermaid
flowchart LR
    Browser[React 前端] --> Nginx[Nginx 反向代理 :8087]
    Nginx --> Frontend_Service[前端容器 :5173]
    Nginx --> Backend_Service[FastAPI / Uvicorn :8000]
    Backend_Service --> MySQL[(外部 MySQL)]
    Backend_Service --> Redis[(Redis 容器)]

    style Browser fill:#f9f,stroke:#333
    style Nginx fill:#9cf,stroke:#333
    style Frontend_Service fill:#6c9,stroke:#333
    style Backend_Service fill:#69c,stroke:#333
    style MySQL fill:#fc9,stroke:#333
    style Redis fill:#fc9,stroke:#333
```

- **前端：** React 19、TypeScript、Vite 8、React Router 7、Tailwind CSS 4；測試使用 Vitest 與 Testing Library。
- **後端：** Python `>=3.12,<3.14`、FastAPI、Pydantic 2、SQLAlchemy 2、Alembic、Uvicorn；依賴版本範圍及鎖定版本分別見 `backend/pyproject.toml`、`backend/uv.lock`。
- **資料與認證：** MySQL（PyMySQL）、Redis、JWT（PyJWT）；Redis 用於 JWT 撤銷狀態。
- **執行與品質：** Docker Compose 啟動 Redis、後端、前端及 Nginx；MySQL 必須外部提供。後端使用 pytest、Ruff、mypy；前端使用 Vitest、oxlint、TypeScript 與 Vite build。

## 本機啟動與 Demo 初始化

### 前置條件

- Python 3.12 或 3.13 與 [uv](https://docs.astral.sh/uv/)
- Node.js 20.19+ 與 npm（CI 使用 Node.js 20；Vite 8 的版本需求見 `frontend/package-lock.json`）
- MySQL 8 相容資料庫，並建立專用的 `smtms` 開發資料庫及使用者
- Redis 7（可由 Compose 啟動）
- Docker Compose（若要使用容器啟動）

> ⚠️ **重要聲明**：MySQL 不在 `docker-compose.yml` 中建立。請先啟動外部 MySQL，並確保後端可連線。不要將 `.env`、密碼、Token 或含機密的連線字串提交至 Git。

### 設定環境

```powershell
Copy-Item backend/.env.example backend/.env
```

編輯本機 `backend/.env` 的 `DATABASE_URL`，填入 MySQL 連線資訊；`SECRET_KEY` 請換成至少 32 字元的隨機值，`SMTMS_SEED_PASSWORD` 請設成本機 Seeder 測試密碼（至少 12 字元）。`.env.example` 只提供佔位值，不可直接當作安全密碼使用。

#### 環境差異說明
- **直接在 Windows 主機執行後端**：`127.0.0.1` 可指向本機 MySQL 與 Redis
- **使用 Docker Compose**：容器內的 `127.0.0.1` 指向容器本身，請將資料庫主機改為 Docker Desktop 的 `host.docker.internal`。Compose 會自動覆寫 `REDIS_URL` 為其內部 Redis 服務位址 `redis://redis:6379/0`。

### 安裝、遷移及建立示範資料（僅本機開發適用）

> ⚠️ **本機開發專用**：此步驟僅適用於直接在 Windows 主機執行前後端的場景。若使用 Docker Compose，請參閱下方的容器啟動說明。

在專案根目錄執行：

```powershell
Set-Location backend
uv sync --group dev
# 檢查當前資料庫遷移版本
uv run python -m alembic -c alembic.ini current
# 套用所有遷移
uv run python -m alembic -c alembic.ini upgrade head
# 設定 Seeder 密碼並執行資料植入
$env:SMTMS_SEED_PASSWORD = "請設定本機測試密碼(至少12字元)"
uv run python scripts/seed_dev.py
```

#### Seeder 安全限制
Seeder 僅允許在下列條件下執行：
1. `APP_ENV=development` 或 `test` 環境
2. 連線至本機 `localhost:3306/smtms` 資料庫
3. 資料庫處於預期的 Alembic 遷移版本

> ❗️ 容器環境中 Seeder 預設會阻擋執行，因為容器內資料庫主機為 `host.docker.internal`，不符合 Seeder 的安全檢查。若要在容器中執行 Seeder，請參閱 `backend/README.md` 進一步說明。

### 啟動服務

#### 方式一：Docker Compose 完整棧（推薦 Demo 使用）

MySQL 仍須由外部提供，Compose 只會啟動 Redis、後端、前端及 Nginx：

```powershell
Set-Location C:\laragon\www\smtms
docker compose up --build
```

啟動後的存取位址：
- 系統入口：`http://127.0.0.1:8087/`（Nginx 反向代理）
- API 文件（Nginx 代理）：`http://127.0.0.1:8087/docs`
- 直接存取後端：`http://127.0.0.1:8000/docs`
- 直接存取前端開發伺服器：`http://127.0.0.1:5173/`

#### 方式二：本機開發伺服器（開發除錯適用）

先確保 MySQL 與 Redis 已在本機運作，並在一個終端機啟動後端：

```powershell
Set-Location C:\laragon\www\smtms\backend
uv sync --group dev
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

再於另一個終端機啟動前端：

```powershell
Set-Location C:\laragon\www\smtms\frontend
npm ci
npm run dev
```

Vite 開發伺服器預設在 `http://localhost:5173/`。前端 API Base URL 由 `frontend/src/api/client.ts` 讀取環境變數 `VITE_API_BASE_URL`，若未設定則預設為 `http://localhost:8000`。

## 驗證與品質檢查

以下是專案設定及 CI 工作流程實際執行的檢查指令：

```powershell
# 後端（backend 目錄；測試需可用的 MySQL、Redis 與測試環境設定）
uv run ruff check .          # 程式碼風格檢查
uv run mypy app/             # 型別檢查
uv run pytest -q             # 執行測試

# 前端（frontend 目錄）
npm run lint                 # oxlint 程式碼檢查
npx tsc --noEmit             # TypeScript 型別檢查
npm test                     # Vitest 單元測試
npm run build                # 生產建置
```

CI 工作流程與資料庫／Redis 測試服務定義見 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)。完整後端環境設定及 Seeder 限制見 [`backend/README.md`](backend/README.md)，前端說明見 [`frontend/README.md`](frontend/README.md)，資料表與技術規格見 [`spec.md`](spec.md)。

## 專案結構

```text
backend/                 FastAPI API、模型、Alembic 遷移、Seeder 與測試
frontend/                React/TypeScript UI 與前端測試
docker/nginx/            Nginx 反向代理設定
docker-compose.yml       Redis、backend、frontend、Nginx 服務定義
spec.md                  資料模型與技術規格
```