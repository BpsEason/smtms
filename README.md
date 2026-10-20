# SMTMS — Supplier Material Traceability Management System

![CI](https://github.com/BpsEason/smtms/actions/workflows/ci.yml/badge.svg)

SMTMS 是一個以供應商、物料批號與 IQC 品保流程為核心的追溯管理系統，目標是把供應商宣告、實際收料、內部批號拆分與檢驗結果連成一條可稽核的資料鏈。

這個專案聚焦於一個常見的製造場景：供應商交貨時宣告批號，倉儲實際收料後，內部需將貨品拆分成內部批號，再由品保進行檢驗與放行。若沒有統一的資料鏈與數量/權限約束，這些資訊很容易散落在 Excel、手工紀錄與不同系統之間，造成追溯困難與資料錯誤。

## 專案概覽

- 前端：React 19 + TypeScript + Vite
- 後端：FastAPI + SQLAlchemy 2.x + Alembic
- 資料庫：MySQL（外部資料庫，不由 Docker Compose 建立）
- 快取／狀態：Redis
- 認證：JWT + RBAC 權限控制
- 代理：Nginx
- 部署：Docker Compose

這個 repository 不是泛用型企業模板，而是依照實際程式碼與本機驗收結果建構出的可追溯流程系統。

> 本 README 依照目前工作區的實際程式碼、配置與驗收結果整理，並保留已知限制與未完成項目。完整資料表與技術規格請見 [spec.md](spec.md)。

---

## 1. 專案定位

SMTMS 解決的是供應鏈與品保領域中常見的追溯問題：供應商宣告批號、實際收料、內部拆批、IQC 檢驗這幾個步驟若沒有連成一個系統，就很難確認每一筆材料的來源、數量與最終狀態。

這個專案在程式碼中實作了真實業務約束：

- 收料數量不能超過供應商批號的宣告總量
- 內部拆批總量不能超過收料剩餘可拆量
- 批號狀態只能依照定義的檢驗規則流轉
- 供應商帳號只能存取自己供應商範圍內的資料
- 供應商首次登入必須先完成密碼變更，才能使用受保護 API

這不是單純的儀表板專案，而是一個有資料邊界、數量約束與權限隔離的追溯流程系統。

---

## 2. 系統畫面與公開展示準備

目前這個 repository 中沒有已提交、可直接公開展示的真實產品截圖。

專案的實際 UI 介面位於 [frontend/src/pages](frontend/src/pages)，但尚未找到適合直接放到 GitHub 展示的 screenshot set。建議補拍的畫面如下：

- 儀表板：角色總覽與導覽權限
- 供應商目錄：供應商資料與關聯關係
- 物料目錄：材料主檔與供應商連結
- 收料流程：供應商批號到收料，並顯示剩餘數量
- 內部分批：收料拆分為內部批號與狀態顯示
- IQC 流程：檢驗結果、放行／拒收狀態
- 追溯查詢：可用供應商批號、收料單、內部批號、IQC 編號或物料代碼查完整分支
- 供應商資格文件與附件管理：CRUD、受控下載及上傳狀態

建議儲存位置：

- docs/screenshots/

請不要用 AI 生成的介面圖片、開發測試網址擷取圖或假畫面冒充實際產品介面。

---

## 3. 核心業務流程

```mermaid
flowchart TD
    A[供應商與物料關聯] --> B[供應商批號]
    B --> C[收料單]
    C --> D[內部批號拆分]
```
6. 具備審核權限的內部品保人員可核准或退回檢驗；退回時必須填寫理由，所有決策都會留下審核歷程。
7. 全鏈路追溯可從供應商批號、收料單、內部批號、IQC 編號或物料代碼查詢來源、分批、檢驗及簽核紀錄。

### 實際資料角色
- `material_receipts`：實際收料事件
- `internal_material_lots`：由收料拆分出的內部批號
- `iqc_records`：檢驗結果、放行狀態及目前審核狀態，連結到收料或內部批號
- `quality_reviews`：IQC 審核決策歷程，保存核准／退回結果、審核人員、時間、意見與退回理由
- `supplier_qualification_documents`：供應商資格／檢驗文件 metadata
- `supplier_document_attachments`：附件 metadata；實際檔案儲存在後端設定的本機持久化目錄

這些資料映射實作於 [backend/app/models/quality.py](backend/app/models/quality.py)，API 入口則在 [backend/app/api/routes/quality.py](backend/app/api/routes/quality.py)。

---

## 4. 角色與實際功能範圍

UI 與 API 都有實際權限控制，不是純前端展示。

### 內部管理員／系統操作人員

已實作功能：

- 使用者登入與登出
- JWT token 驗證與使用者資料讀取
- 角色與權限管理
- 使用者角色指派
- 管理頁面存取權限控制
- `users:manage` 權限同時在後端路由與前端路由中實作

相關實作：

- [backend/app/api/routes/access.py](backend/app/api/routes/access.py)
- [backend/app/api/routes/auth.py](backend/app/api/routes/auth.py)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/pages/AdminPage.tsx](frontend/src/pages/AdminPage.tsx)

### 物料／收料／品保角色

已實作功能：

- 供應商主檔 CRUD
- 物料主檔 CRUD
- 供應商與物料關聯維護
- 供應商資格文件建立、查詢、更新及刪除
- 文件附件上傳、授權下載及刪除
- 收料建立與查詢
- 供應商批號建立與查詢
- 內部批號建立與狀態查看
- IQC 建立、更新與狀態轉換
- IQC 品保審核簽核：待審核清單、歷程檢視、核准與退回（退回理由必填）
- 全鏈路追溯查詢與本頁 CSV 匯出

品保簽核 API 位於 `/api/v1/iqc/{iqc_id}/reviews`，提供歷程查詢；核准及退回操作分別為 `/approve` 與 `/return`。API 以 `quality:review`、`quality:approve`、`quality:return` 權限控管，Seeder 僅將簽核權限指派給內部 QA 與管理員角色，不會授予一般使用者或供應商帳號。簽核歷程另存於 `quality_reviews`，不會以覆寫 IQC 欄位取代歷史決策。

供應商資格文件以 `/api/v1/suppliers/{supplier_id}/documents` 為入口，支援 `GET` 列表、`POST` 建立、`GET/PATCH/DELETE /{document_id}` 單筆讀寫；附件由 `/{document_id}/attachments` 上傳／列出、`/{attachment_id}/download` 受控下載，並可 `DELETE` 刪除。讀取要求 `suppliers:read`，寫入要求 `suppliers:write`；供應商帳號另受自身 `supplier_id` 範圍限制。附件目前限制為 PDF、PNG、JPEG，預設上限 10 MiB，後端以檔案內容簽章判斷類型。

供應商批號使用既有 `POST /api/v1/supplier-lots` 與 `GET /api/v1/supplier-lots`。建立要求 `suppliers:write` 或窄權限 `supplier-lots:write`，並驗證供應商、物料及 supplier-material 關聯；批號依 `(supplier_id, material_id, supplier_lot_no)` 唯一，數量須為正且符合 `DECIMAL(18,4)` 精度，單位取自物料主檔。收料仍會鎖定批號並限制累計收料數量不超過申報量。

統一追溯入口為 `GET /api/v1/traceability`，必須同時具備 `receipts:read`、`materials:read`、`iqc:read`，並且一次恰好提供一個識別參數：`supplier_lot_no`、`receipt_no`、`internal_lot_no`、`iqc_id` 或 `material_code`。結果分頁回傳供應商、物料、供應商批號、收料、所有內部批號分支、IQC 與簽核歷程；不存在的識別值回傳 `404`。前端「全鏈路追溯」頁另可匯出目前結果頁 CSV。

相關頁面：

- [frontend/src/pages/CatalogPages.tsx](frontend/src/pages/CatalogPages.tsx)
- [frontend/src/pages/WorkflowPages.tsx](frontend/src/pages/WorkflowPages.tsx)

### 供應商帳號範圍隔離

已實作功能：

- 供應商帳號會綁定到特定 `supplier_id`
- 供應商登入只能看到自己的供應商資料與批號
- 跨供應商存取會被拒絕，回應 `403 Forbidden`
- 首次登入必須先完成密碼變更，才能存取受保護 API

這些邊界由後端權限檢查與前端路由保護共同實作，核心位置在 [frontend/src/App.tsx](frontend/src/App.tsx)。

### 尚未完成的功能與交付邊界

以下功能明確不被宣稱為已交付：

- 附件目前僅接受 PDF、PNG、JPEG，預設 10 MiB；尚無病毒掃描、內容解碼驗證或外部物件儲存
- 追溯 CSV 只匯出目前分頁，不提供跨頁／完整查詢結果背景匯出
- 正式生產環境部署與長時間負載測試

這點很重要：系統已經具備可在本機執行的追溯流程，但不被定位為已完成的正式生產平台。

---

## 5. 技術架構

```mermaid
flowchart LR
    Browser[Browser] --> Nginx[nginx :8087]
    Nginx --> Frontend[frontend :5173]
    Nginx --> Backend[backend :8000]
    Backend --> MySQL[(MySQL external)]
    Backend --> Redis[(Redis)]
```

## 9. 持續整合 (CI)

本專案使用 GitHub Actions 自動執行持續整合驗證，每當程式碼 Push 到主要分支或建立 Pull Request 時，都會自動執行：

- 後端：程式碼檢查（ruff）、型別檢查（mypy）、單元測試（pytest）
- 前端：程式碼檢查（oxlint）、型別檢查（TypeScript）、單元測試（vitest）、生產環境建置

詳細的 CI 設定與操作說明請參考 [docs/github-actions.md](docs/github-actions.md)。
### 架構說明

- 前端是基於 Vite 的 React 應用，並在前端層保護路由權限。
- 後端是 FastAPI 應用，啟動方式透過 Uvicorn，入口配置在 [backend/app/main.py](backend/app/main.py)。
- 資料存取直接透過 SQLAlchemy ORM 與 session 管理，而不是過度抽象化的 repository 層。
- Redis 用於 JWT 撤銷及其他短期認證狀態。
- MySQL 是外部服務，不由 Docker Compose 建立資料庫容器。
- Docker Compose 會啟動 Redis、backend、frontend、nginx，但不建立資料庫本身。
- 附件實際檔案放在 `DOCUMENT_STORAGE_DIR`；Compose 將 `./backend/var/documents` 掛載到 backend 的 `/app/var/documents`，以便容器重啟後保留。此目錄已列入 `.gitignore`，不應提交上傳檔案。

### 真實工程決策

- JWT 驗證在後端強制執行，前端也會檢查使用者 profile 再顯示受保護頁面。
- 供應商資料隔離不是只靠前端篩選，而是由後端供應商範圍檢查實作。
- 收料數量驗證防止超出供應商批號宣告量。
- 內部拆批驗證避免超出收料剩餘可拆量。
- IQC 狀態流轉受固定規則控制，避免任意改成不合理狀態。
- 品保核准／退回需通過後端 RBAC；決策人由登入身分取得，退回理由必填，且每次決策都新增不可被後續決策覆寫的歷程紀錄。
- 文件下載走受保護的 API，不暴露靜態檔案路徑；伺服器只用 metadata 的隨機 storage key 尋找檔案，並限制檔案大小與已支援格式。
- 全鏈路追溯先分頁選取收料主鍵，再以 select-in 載入供應商、物料、批號、IQC 與審核歷程，避免將一對多分支攤平後重複計算數量。

這些邏輯不是只存在文件中，而是落在品質流程路由與資料模組中。

---

## 6. 驗收與測試

### 已驗證的實際行為

以下檢查都基於這個工作區中已執行過的實際命令與資料。

#### 後端測試證據

執行命令：

```bash
cd c:\laragon\www\smtms\backend
uv run pytest -q
```

結果：

- 完整測試套件實際通過：61 passed、1 skipped。
- 涵蓋文件 CRUD／附件上傳下載與失敗清理、批號規則、追溯分支與供應商隔離、Seeder 冪等性，以及既有功能回歸。

#### 前端測試證據

執行命令：

```powershell
cd frontend
npm test -- --run
```

結果：3 個測試檔案、18 tests passed。

#### 前端建置證據

執行命令：

```bash
cd c:\laragon\www\smtms\frontend
npm run build
```

結果：

- 前端構建在本次 session 中成功完成。
- 代表 TypeScript + Vite 組合能正常編譯。

#### Lint 與型別檢查

執行命令：

```bash
cd c:\laragon\www\smtms\backend
uv run ruff check .
```

結果：

- 修改檔案的 Ruff 完整檢查尚未通過：目前有 164 項 E501 長行問題；修改檔案的 Ruff import 排序檢查通過。
- `uv run mypy app/services/document_storage.py app/schemas/catalog.py` 通過。
- `npm run lint` 完成但有 3 個 React `set-state-in-effect` warnings，位於 workflow/document UI effect。

#### Migration／資料庫驗證

- 已對設定中的本機開發 MySQL `smtms` 執行唯讀檢查；確認 migration 前 revision 為 `20261019_autoincrement_pks`，且 `iqc_records`、`material_receipts`、`supplier_qualification_documents` 已有資料。
- 曾在 MySQL 既有 `alembic_version.version_num VARCHAR(32)` 限制下，發現 merge revision ID 過長；已縮短 revision ID 並恢復遷移流程。
- 修正後已將完整 Alembic head 套用至此開發資料庫；目前 head 為 `20261019_doc_attachments`。Migration 僅新增審核／附件 schema 並合併歷史 heads，沒有清空業務資料。
- `uv run alembic upgrade head --sql` 離線 SQL 渲染成功。

### Live API 驗收紀錄

專案中保留了實際的 local validation 資料：

- [live_trace_acceptance_results.json](live_trace_acceptance_results.json)
- [live_trace_acceptance_readback.json](live_trace_acceptance_readback.json)
- [live_portal_isolation_results.json](live_portal_isolation_results.json)

這些紀錄覆蓋的實際行為包括：

- 端到端追溯鏈驗證
- 收料數量限制驗證
- 重複資料拒絕與去重保護
- IQC 狀態轉換驗證
- 供應商入口權限隔離
- 內部拆批數量與邊界驗證

### 尚未宣稱的內容

- 不宣稱正式生產環境已就緒
- 不宣稱已完成長時間負載測試
- 不宣稱完成 ISO / 合規認證
- 不宣稱 lint 或全部前端測試已通過，除非有新鮮執行證據

---

## 7. 本機啟動方式

### 必要條件

- Python 3.12+
- uv
- Node.js 22 或相容版本
- 後端所需的 MySQL 實例
- Redis（可透過 Docker Compose 啟動）

### 環境變數

後端設定讀取於 [backend/app/core/config.py](backend/app/core/config.py)。目前預期使用的變數包含：

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

複製 [backend/.env.example](backend/.env.example) 作為本機設定起點，並替換資料庫連線與至少 32 字元的 `SECRET_KEY`。不要將真實機密提交到 Git。

- `DOCUMENT_STORAGE_DIR`：附件儲存根目錄，預設 `var/documents`
- `DOCUMENT_MAX_FILE_BYTES`：單一附件上限，預設 `10485760` bytes（10 MiB）

範例（僅示意）：

```powershell
$env:APP_ENV = "development"
$env:SECRET_KEY = "replace-with-at-least-32-char-random-key"
$env:DATABASE_URL = "mysql+pymysql://user:password@127.0.0.1:3306/smtms"
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
```

### 以 Docker Compose 啟動

從專案根目錄執行：

```powershell
cd C:\laragon\www\smtms
docker compose up --build
```

本機入口：

- 應用程式：http://127.0.0.1:8087/
- Swagger / OpenAPI：http://127.0.0.1:8087/docs
- 前端開發伺服器：http://127.0.0.1:5173/
- 後端直接 API：http://127.0.0.1:8000/docs

目前 Compose 會啟動：

- Redis
- backend
- frontend
- nginx

### 直接啟動後端

```powershell
cd backend
uv sync --group dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Migration、Seeder 與測試

在已確認指向預期開發／測試資料庫的 backend 環境執行：

```powershell
cd backend
uv run alembic current
uv run alembic upgrade head
uv run python scripts/seed_dev.py
uv run pytest -q
```

Seeder 僅允許 development/test 的 localhost MySQL `smtms` 資料庫，並要求 schema 位於目前 revision；Seeder 可重複執行且不刪除非 Seeder 業務資料。執行 migration 前請核對 `DATABASE_URL`、資料庫名稱及 `alembic current`，不要在未確認環境時對其他資料庫升級。

---

## 8. 專案結構

```text
.
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── scripts/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── docker/
│   └── nginx/
├── .github/workflows/ci.yml
├── docs/github-actions.md
├── docker-compose.yml
├── README.md
├── spec.md
├── live_trace_acceptance_results.json
├── live_trace_acceptance_readback.json
├── live_portal_isolation_results.json
└── backups/
```

---

## 9. 限制與後續規劃

### 目前已知的限制

- 附件只允許 PDF、PNG、JPEG，預設上限 10 MiB；尚無病毒掃描、解碼驗證或外部物件儲存
- CSV 僅匯出追溯查詢的目前分頁，沒有背景完整資料集匯出
- 正式部署與長時間負載測試仍是未來工作

### 建議優先順序

1. 擴大平行拆批、文件附件和供應商隔離的驗證矩陣。
2. 評估附件病毒掃描與外部物件儲存需求。
3. 在超出本機開發環境前，補上正式生產準備清單。

---

## 10. 結語

SMTMS 是一個以真實製造流程為核心的追溯管理專案，不是單純的官網式 Demo。它目前已經具備從供應商宣告、收料、內部分批到 IQC 判定的連貫流程，同時保留真實工程邊界：未完成功能、保留的驗證範圍，以及尚未完成的正式環境認證。

如果這個專案被拿來作為工程作品集評估，最有價值的地方在於：

- 後端把實際業務約束寫進程式邏輯
- 供應商與內部使用者有明確權限隔離
- 多張資料表之間存在清楚的追溯鏈
- 驗證是基於本機執行結果與實際資料，而非空泛宣稱

這個 repository 適合做技術審查，但不被呈現成已完成的正式企業級生產系統。