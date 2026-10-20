# SMTMS 系統規格文件（spec.md）

> 本文件依目前儲存庫中的實際程式碼、Alembic 遷移、Seeder、測試與部署設定撰寫。
> 凡程式碼無法證實者一律標記「待確認」，未實作者標記「尚未實作」。
> 本文件不宣稱符合任何 ISO、IPC 或其他外部品質標準。

---

## 1. 文件資訊

| 項目           | 內容                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系統名稱       | SMTMS（Supplier Material Traceability Management System）                                                                                                      |
| 系統定位       | 供應商與物料追溯暨品保管理系統                                                                                                                                 |
| 文件目的       | 說明 SMTMS 目前實際運作範圍、資料模型、API、前端與部署現況，作為驗收與後續維護依據                                                                             |
| 文件範圍       | 供應商／物料主檔、供應商批次、進料收料、內部批次拆分、IQC 進料檢驗、權限、部署設定                                                                             |
| 文件版本       | 1.0                                                                                                                                                            |
| 文件日期       | 2026-10-19                                                                                                                                                     |
| 依據程式碼版本 | 儲存庫現況（未使用版本控制歷史，以工作區檔案為準）                                                                                                             |
| 規格狀態       | 部分實作。核心追溯鏈（供應商→物料→供應商批次→收料→內部批次→IQC）已實作；品質異常管理（含處置、歷程、附件）已部分實作；主檔刪除、供應商批次建立、資格文件維護、使用者管理、CAPA根因分析等尚未完整實作 |

### 驗證狀態標記定義（全文通用）

| 標記                    | 意義                                                         |
| ----------------------- | ------------------------------------------------------------ |
| ✅ 已實作且已驗證       | 程式碼存在，且有自動化測試或已實際執行之驗證證據             |
| ⚠️ 已實作但尚未完整驗證 | 程式碼存在，但缺少自動化測試或未在真實 MySQL／Redis 環境驗證 |
| ❌ 尚未實作／待確認     | 程式碼中找不到、或無法由現有程式碼證實                       |

---

## 2. 系統概述

### 2.1 系統解決的業務問題

SMTMS 用來管理「供應商提供的原物料」之品質追溯：

1. 維護供應商主檔與其資格文件。
2. 維護原物料主檔，並建立「供應商—物料」供貨關聯（含首選供應商）。
3. 記錄供應商批次（`supplier_lots`）。
4. 依供應商批次登錄收料（`material_receipts`），追蹤可分配數量。
5. 將收料數量拆分為內部物料批次（`internal_material_lots`）。
6. 對內部批次執行 IQC 進料檢驗（`iqc_records`），並依檢驗結果與放行狀態更新批次狀態。
7. 透過清單與明細頁面查詢上述資料，形成可查詢、可驗證的追溯關係。

### 2.2 主要使用角色（依實際 Seeder 定義）

| 帳號                     | 角色名稱                 | 實際權限（經 `seed:` 正規化後）                                              |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------- |
| `seed_admin`             | SMTMS Seed Administrator | 全部 9 項權限                                                                |
| `seed_qa_1`、`seed_qa_2` | SMTMS Seed QA            | `suppliers:read`、`materials:read`、`receipts:read`、`iqc:read`、`iqc:write` |
| `seed_receiver_1`        | SMTMS Seed Receiver      | `suppliers:read`、`materials:read`、`receipts:read`、`receipts:write`        |

> 上述帳號僅供開發／測試（見 `backend/scripts/seed_dev.py`）。系統**沒有**內建正式環境管理員帳號；帳號與角色必須由外部以資料庫或 Seeder 建立。

### 2.3 主要業務流程

```
供應商(suppliers) ─┐
                   ├─ supplier_materials（供貨關聯、首選）
物料(materials) ───┘
      │
      └─ supplier_lots（供應商批次：供應商＋物料＋批號）
              │
              └─ material_receipts（收料：供應商＋物料＋供應商批次；含 qty_remaining）
                      │
                      ├─ internal_material_lots（內部批次，拆分自收料）
                      │        │
                      └────────┴─ iqc_records（IQC：關聯收料 及／或 內部批次）
                                   └─ 依結果更新 internal_material_lots.lot_status
```

### 2.4 系統架構與技術堆疊

| 層               | 技術                                                         | 依據                                              |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| 後端框架         | FastAPI + Uvicorn                                            | `backend/app/main.py`、`backend/pyproject.toml`   |
| ORM／遷移        | SQLAlchemy 2.x（同步 Session）＋ Alembic                     | `backend/app/db/session.py`、`backend/alembic/`   |
| 資料庫           | MySQL（外部提供，Compose 不管理），驅動 PyMySQL              | `backend/app/core/config.py`、`backend/README.md` |
| 快取／Token 撤銷 | Redis                                                        | `backend/app/core/redis_client.py`                |
| 認證             | PyJWT（HS256）＋ passlib/bcrypt                              | `backend/app/core/security.py`                    |
| 前端             | React 19 + TypeScript + Vite + React Router + Tailwind CSS 4 | `frontend/package.json`                           |
| 反向代理         | Nginx（`nginx:alpine`）                                      | `docker/nginx/default.conf`                       |
| 部署             | Docker Compose（backend／frontend／redis／nginx 四服務）     | `docker-compose.yml`                              |

### 2.5 各元件實際關係

- 前端（Vite dev server，連接埠 5173）以 `VITE_API_BASE_URL` 決定 API 位址；Compose 中設為空字串，改走同源 Nginx。
- Nginx（容器 80，主機 8087）將 `/api/`、`/health`、`/docs`、`/openapi.json` 反向代理至 backend:8000，其餘導向 frontend:5173。
- 後端啟動時於 lifespan 初始化 Redis 連線（`app_lifespan` → `init_redis_client`），關閉時釋放。
- 後端每次驗證 Token 皆需查詢 Redis 的撤銷名單；Redis 不可用時回 503（不放行）。
- 資料庫由後端直連外部 MySQL；容器內若設定 `localhost` 會被 `docker-entrypoint.py` 自動改寫為 `host.docker.internal`。
- 檔案儲存：品質異常案件已實作附件上傳、下載與刪除 API（`backend/app/api/routes/nonconformances.py`），檔案儲存於本地伺服器，同時記錄 SHA256 驗證碼、檔案大小與媒體類型。供應商資格文件僅有 `file_path` 字串欄位，無完整上傳下載機制。
- 檔案限制：目前僅於程式碼中實作基本的檔案類型過濾，無強制的檔案大小限制檢查，缺少病毒掃描機制。
- 權限控制：僅有異常案件的關聯使用者與具備 `nonconformances:write` 權限的使用者能管理附件；供應商帳號僅能下載自己的異常案件附件。
- ⚠️ 安全限制：未實作外部物件儲存（如 S3），所有檔案儲存於本地；無完整的檔案內容驗證，無法防止惡意檔案上傳。

---

## 3. 使用角色與權限

### 3.1 登入／登出／目前使用者

| 功能       | 端點                       | 說明                                    | 狀態 |
| ---------- | -------------------------- | --------------------------------------- | ---- |
| 登入       | `POST /api/v1/auth/login`  | 帳號密碼換取 Bearer JWT                 | ✅   |
| 登出       | `POST /api/v1/auth/logout` | 將目前 JWT 的 `jti` 寫入 Redis 撤銷名單 | ✅   |
| 目前使用者 | `GET /api/v1/auth/me`      | 回傳帳號、Email、啟用狀態、角色、權限   | ✅   |

登入失敗一律回 `401`，且對不存在的帳號使用固定的 dummy bcrypt 雜湊（`_DUMMY_PASSWORD_HASH`）以維持一致的驗證路徑（`backend/app/api/routes/auth.py`）。

### 3.2 JWT 驗證與 Token 撤銷機制

- 演算法：`HS256`（`settings.algorithm`），金鑰：`settings.secret_key`（`SECRET_KEY`，`min_length=32`）。
- Claims：`sub`、`user_id`、`iat`、`exp`、`jti`；`decode_access_token` 以 `options={"require": [...]}` 強制要求以上欄位齊全。
- 有效期：`ACCESS_TOKEN_EXPIRE_MINUTES`，預設 60 分鐘。
- 撤銷：登出時以 `auth:revoked:{jti}` 為鍵寫入 Redis，TTL = Token 剩餘壽命；`get_current_token_claims` 每次請求檢查該鍵。
- Redis 異常：`get_current_token_claims` 與 `revoke_access_token` 在 Redis 連線失敗時回 **503 `Authentication service unavailable`**，不會略過檢查。

### 3.3 角色與權限的實際關係

- 權限來自資料庫：`users → user_roles → roles → role_permissions → permissions`，於每次請求即時解析（`get_current_user`），非寫入 Token。
- 角色名稱與權限代碼皆以**字串**儲存，無資料庫 ENUM。
- 權限代碼正規化：`normalize_permission_code()` 會移除 `seed:` 前綴。此規則同時套用於 `get_current_user`（產生使用者權限集合）與 `require_permission`（比對所需權限）。
- **沒有「管理員自動全權」邏輯**。`require_permission` 只依實際授予的權限集合判斷；即使角色名稱為 admin，未在 `role_permissions` 授予的權限一律拒絕。

### 3.4 已定義的權限代碼

依 `backend/scripts/seed_dev.py` 的 `PERMISSIONS`：

| 權限代碼          | 用途               | 實際被使用的端點                                                |
| ----------------- | ------------------ | --------------------------------------------------------------- |
| `suppliers:read`  | 讀取供應商         | suppliers 路由、`GET /supplier-lots`                            |
| `suppliers:write` | 維護供應商         | suppliers 路由                                                  |
| `materials:read`  | 讀取物料／內部批次 | materials 路由、`GET /internal-lots`、`GET /internal-lots/{id}` |
| `materials:write` | 維護物料           | materials 路由                                                  |
| `receipts:read`   | 讀取收料           | receipts 路由                                                   |
| `receipts:write`  | 建立收料／拆分批次 | `POST /receipts`、`POST /receipts/{id}/internal-lots`           |
| `iqc:read`        | 讀取 IQC           | iqc 路由                                                        |
| `iqc:write`       | 維護 IQC           | `POST /iqc`、`PATCH /iqc/{id}`                                  |
| `nonconformances:read` | 讀取品質異常 | `GET /nonconformances`、`GET /nonconformances/{id}`            |
| `nonconformances:write` | 維護品質異常 | `POST /nonconformances`、`PATCH /nonconformances/{id}`、附件管理 |
| `users:manage`    | 管理使用者         | ❌ 尚無任何端點使用（僅在測試中被驗證拒絕邏輯）                 |

### 3.5 前端選單／路由權限 vs 後端 API 權限

| 面向     | 前端                                                                          | 後端                                                  |
| -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| 選單過濾 | `frontend/src/components/AppLayout.tsx` 依 `profile.permissions` 過濾選單項目 | 無                                                    |
| 路由保護 | `frontend/src/App.tsx` 的 `PermissionPage` 檢查單一權限後才渲染               | 無                                                    |
| 實際授權 | 僅為 UI 便利                                                                  | `require_permission()` / `require_role()`（真正防線） |
| 責任邊界 | 前端隱藏不等於拒絕；直接呼叫 API 仍由後端把關                                 | 後端為唯一授權來源                                    |

> 前端只做「單一權限存在性」檢查，未區分 read/write 的組合情境；後端仍會逐一驗證。

### 3.6 未授權／未登入／權限不足的處理

| 情境                 | HTTP | 回應 detail                          | 來源                               |
| -------------------- | ---- | ------------------------------------ | ---------------------------------- |
| 未帶 Token           | 401  | `Not authenticated`                  | `get_current_token_claims`         |
| Token 無效或過期     | 401  | `Invalid or expired token`           | 同上                               |
| Token 已撤銷         | 401  | `Token has been revoked`             | 同上                               |
| Redis 不可用         | 503  | `Authentication service unavailable` | 同上                               |
| 使用者不存在或已停用 | 401  | `User is disabled or not found`      | `get_current_user`                 |
| 缺少所需權限         | 403  | `Missing permissions: [...]`         | `require_permission`               |
| 角色不符             | 403  | `Forbidden`                          | `require_role`（目前僅測試中使用） |

前端收到 401 且非登入端點時，會清除 `localStorage` 的 `smtms_token` 並派送 `smtms:unauthorized` 事件強制登出（`frontend/src/api/client.ts`、`App.tsx`）。

### 3.7 供應商資料隔離機制

- 實作方式：使用者可綁定 `supplier_id`（`backend/alembic/versions/20261019_supplier_user_link.py`），後端透過 `ensure_supplier_access` 函數強制限制供應商帳號只能存取自己的資料。
- 適用範圍：供應商批次、收料記錄、內部批次、IQC 記錄以及品質異常案件。
- 測試覆蓋：`backend/tests/test_supplier_isolation.py` 包含專門的測試案例驗證資料隔離机制。
- ✅ 已驗證：供應商帳號無法存取其他供應商的任何資料，跨供應商的資料存取會返回 403 Forbidden。

### 3.8 `seed:` 權限前綴的實際處理與限制

- 處理方式：讀取時移除 `seed:`（後端 `normalize_permission_code`；前端 `normalizePermissions`）。因此資料庫存 `seed:suppliers:read`，實際生效為 `suppliers:read`。
- 限制：此為字串前綴約定，無資料庫層限制；若同一角色同時擁有 `suppliers:read` 與 `seed:suppliers:read`，正規化後會合併為同一權限。無證據顯示此情形已發生，⚠️ 待確認。

---

## 4. 功能規格

### 4.1 使用者登入與權限管理

- 功能目的：以帳號密碼取得 JWT，並依資料庫角色／權限授權。
- 已實作 API：`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`。
- 輸入：`LoginRequest{username, password}`（皆為必填字串）。
- 業務限制：帳號停用不可登入；角色與權限即時由 DB 解析。
- 成功：回 200 與 `access_token`。
- 失敗：401（帳密錯誤／停用／Token 無效）。
- 權限要求：登入本身不需權限；`logout`、`me` 需有效 Token。
- ❌ 已知限制：無使用者新增／停用／改密碼 API；`users:manage` 權限無對應端點；無角色／權限維護 API。

### 4.2 供應商管理

- 功能目的：維護供應商主檔（代碼、名稱、聯絡資訊、狀態）。
- 使用者操作流程：查詢清單（關鍵字／狀態／分頁）→ 建立 → 以 ID 取得明細 → 以 PATCH 局部更新。
- 已實作 API：`GET /suppliers`、`POST /suppliers`、`GET /suppliers/{id}`、`PATCH /suppliers/{id}`。
- 輸入（建立）：`supplier_code`(1–80)、`supplier_name`(1–200)、`status`(預設 `active`)、選填 `contact_name`/`phone`/`email`/`address`/`country`。
- 輸入（更新）：`SupplierUpdate` 採 `extra="forbid"`，且 `supplier_code`/`supplier_name`/`status` 不可為 `null`；其他欄位可設 `null` 清空。
- 業務限制：`supplier_code` 唯一（應用層檢查 + DB unique）。
- 成功：建立回 201；其餘回 200。
- 失敗：409（代碼重複）、404（不存在）、422（欄位驗證）。
- 權限：讀 `suppliers:read`；寫 `suppliers:write`。
- ❌ 已知限制：無刪除 API；無「供應商資格文件」建立／更新／刪除 API（僅能查詢，見 4.3）。

### 4.3 供應商資格文件管理

- 功能目的：記錄供應商資格文件（`supplier_qualification_documents`）。
- 已實作 API：`GET /suppliers/{supplier_id}/documents`（僅查詢）。
- 回傳欄位：`doc_type`、`doc_code`、`doc_name`、`file_path`、`issued_at`、`expires_at`、`approved_by_user_id`、`status`。
- 權限：`suppliers:read`。
- 失敗：404（供應商不存在）。
- ❌ 已知限制：**無任何建立／更新／刪除 API；無檔案上傳／下載**。資料僅能由 Seeder 或外部 SQL 寫入；`file_path` 僅為字串，不代表檔案實際存在。

### 4.4 物料管理

- 功能目的：維護原物料主檔（代碼、名稱、類型、規格、單位、狀態）。
- 已實作 API：`GET /materials`、`POST /materials`、`GET /materials/{id}`、`PATCH /materials/{id}`、`GET /materials/{id}/suppliers`。
- 輸入（建立）：`material_code`(1–80)、`material_name`(1–200)、`material_type`(1–50)、`uom`(1–30)、`status`(預設 `active`)、選填 `spec`(≤255)。
- 輸入（更新）：`MaterialUpdate` 採 `extra="forbid"`，`material_code`/`material_name`/`material_type`/`uom`/`status` 不可為 `null`；`spec` 可設 `null` 清空。
- 業務限制：`material_code` 唯一。
- 成功／失敗：201／200；409（代碼重複）、404、422。
- 權限：讀 `materials:read`；寫 `materials:write`。
- ❌ 已知限制：無刪除 API。

### 4.5 供應商與物料關聯

- 功能目的：建立「供應商供貨哪個物料」及其供應商料號、首選標記。
- 已實作 API：`POST /suppliers/{supplier_id}/materials`、`DELETE /suppliers/{supplier_id}/materials/{material_id}`、`GET /materials/{material_id}/suppliers`。
- 輸入：`SupplierMaterialCreate{material_id(>0), supplier_material_code(≤80, 選填), is_preferred(預設 false)}`。
- 業務規則：
  - 關聯唯一（`supplier_id` + `material_id`），重複建立回 409。
  - 當 `is_preferred=true` 時，會將「同物料」其他關聯的 `is_preferred` 更新為 `false`（`update(...).values(is_preferred=False)`），但**限定同一物料**，跨物料不互相影響。
- 成功：建立 201；刪除 204。
- 失敗：404（供應商／物料不存在，或刪除時關聯不存在，且刪除時會區分物料不存在）；409（關聯重複）。
- 權限：寫入 `suppliers:write`；`GET /materials/{id}/suppliers` 需 `materials:read`。
- ❌ 已知限制：無「更新關聯」API（僅能刪除後重建）；無供貨關聯清單總表 API。

### 4.6 供應商批次管理

- 功能目的：管理供應商端批次（`supplier_lots`）。
- 已實作 API：`GET /supplier-lots`（清單，可關鍵字／`qc_status`／日期區間／分頁）。
- 權限：`suppliers:read`（注意：非 `receipts:read`）。
- ❌ 已知限制：**無建立／更新／刪除／單筆查詢 API**。收料建立必須引用既有 `supplier_lot_id`，但目前只能由 Seeder 或外部 SQL 產生供應商批次；前端於收料頁明確提示「目前 API 尚未提供供應商批次建立功能」。`supplier_lots.qc_status` 預設 `received`，且**沒有任何 API 會更新它**。

### 4.7 進料驗收／收料管理

- 功能目的：依供應商批次登錄收料數量，並追蹤剩餘可分配數量。
- 已實作 API：`GET /receipts`、`POST /receipts`、`GET /receipts/{id}`。
- 輸入（`ReceiptCreate`，`extra="forbid"`）：`supplier_id(>0)`、`material_id(>0)`、`supplier_lot_id(>0)`、`receipt_no`(1–80)、`qty_received(>0)`、`received_at`（必填 datetime）、`notes`(≤500)。
- 業務規則：
  - 供應商、物料、供應商批次必須存在（否則 404）。
  - 供應商批次必須屬於該供應商與物料（否則 400 `Supplier lot does not match the supplier and material`）。
  - 供應商與物料必須已有供貨關聯（否則 400 `Supplier is not linked to the material`）。
  - `receipt_no` 唯一（409）。
  - 建立時 `qty_remaining = qty_received`，`status` 固定寫入 `received`，`received_by_user_id` 由目前登入者寫入。
- 成功：201。
- 失敗：400／404／409。
- 權限：讀 `receipts:read`；寫 `receipts:write`。
- ❌ 已知限制：無更新／刪除 API；`material_receipts.status` 建立後不會再變更（無收料狀態流轉）；`supplier_lots.qty_received` 不因收料而累加。

### 4.8 內部物料批次管理

- 功能目的：將收料數量拆分為可追溯的內部批次。
- 已實作 API：`POST /receipts/{receipt_id}/internal-lots`（拆分）、`GET /internal-lots`、`GET /internal-lots/{id}`。
- 輸入（每個批次）：`InternalLotCreate{internal_lot_no(1–120), qty(>0), expiry_date(選填)}`。端點接受三種 body 形式：單一物件、陣列、或 `{"lots":[...]}`。
- 業務規則：
  - 至少一個批次（否則 400）。
  - 每筆 `qty > 0`（否則 400）。
  - `internal_lot_no` 若已存在（全域比對）回 409。
  - 拆分總量不得超過 `receipt.qty_remaining`（否則 400）。
  - 建立後 `lot_status` 固定為 `quarantine`、`qty_reserved=0`、`uom` 取自物料、`expiry_date` 預設沿用供應商批次。
  - 成功後扣減 `receipt.qty_remaining`。
  - 回應 **僅回傳第一個建立的批次**（`created_lots[0]`），即使一次建立多筆。
- 成功：201。
- 失敗：400／404／409／422。
- 權限：拆分需 `receipts:write`；查詢需 `materials:read`。
- ❌ 已知限制：
  - 無內部批次更新／刪除 API；`qty_on_hand` 除建立外不會被扣減。
  - 一次多筆拆分時只回傳第一筆，其餘需自行查詢，⚠️ 前端未使用多筆模式。
  - 同一請求內若含重複 `internal_lot_no`，前置檢查（逐筆查 DB）不會攔截，可能於 flush 時拋出未處理的 `IntegrityError`（⚠️ 待確認，尚無測試覆蓋）。

### 4.9 IQC 品質檢驗

- 功能目的：對內部批次（或收料）記錄進料檢驗結果，並依結果更新批次狀態。
- 已實作 API：`POST /iqc`、`GET /iqc`、`GET /iqc/{id}`、`PATCH /iqc/{id}`。
- 輸入（`IQCCreate`，`extra="forbid"`）：`receipt_id`/`internal_lot_id`（至少一個）、`sample_qty(>0)`、`inspection_result∈{pending,passed,failed}`、`inspection_date`（選填，未提供則寫入 UTC now）、`release_status∈{hold,released,rejected}`、`remarks(≤500)`。
- 業務規則（Schema 與路由雙層驗證）：
  - 結果與放行狀態必須配對：`passed↔released`、`pending↔hold`、`failed↔rejected`；不符回 400 或 422。
  - 若同時提供 `receipt_id` 與 `internal_lot_id`：內部批次必須屬於該收料（400），且物料必須一致（400）。
  - `inspector_user_id` 一律寫入目前登入者；更新時若嘗試變更會回 400 `Inspector is fixed to the current user`。
  - 建立／更新後，依結果更新內部批次 `lot_status`：`passed+released→available`、`pending+hold→quarantine`、`failed+rejected→rejected`。
- 成功：建立 201；更新 200。
- 失敗：400／404／409／422。
- 權限：讀 `iqc:read`；寫 `iqc:write`。
- ❌ 已知限制：
  - **建立流程分兩次 commit**（先寫 IQC 記錄，再更新批次狀態），非單一交易；第二步失敗時記錄已存在、批次狀態可能未同步（⚠️ 待確認，尚無測試覆蓋此失敗路徑）。
  - 無刪除 API；不支援不合格品處置、隔離單、退貨、讓步接收等流程。
  - `PATCH /iqc/{id}` 可改 `receipt_id`／`internal_lot_id` 關聯，但未驗證新 `internal_lot` 與新 `receipt` 的歸屬／物料一致性（與建立時不同），⚠️ 待確認。

### 4.10 品質異常管理（Nonconformance）

- 功能目的：記錄與追蹤品質異常案件，包含處置、歷程與附件管理。
- 已實作 API：`GET /nonconformances`、`POST /nonconformances`、`GET /nonconformances/{id}`、`PATCH /nonconformances/{id}`、`POST /nonconformances/{id}/dispositions`、`POST /nonconformances/{id}/attachments`、`GET /nonconformances/{id}/attachments/{attachment_id}`、`DELETE /nonconformances/{id}/attachments/{attachment_id}`。
- 輸入（建立）：`NonconformanceCreate` 需包含 `case_no`(唯一)、`title`、`description`、`source`、`severity`，可選關聯 `supplier_id`、`material_id`、`receipt_id`、`supplier_lot_id`、`internal_lot_id`、`iqc_record_id`。
- 業務規則（`backend/app/api/routes/nonconformances.py` _validate_links 驗證）：
  - 所有關聯的實體（供應商、物料、收料、批次、IQC）必須存在且彼此關聯一致。
  - 供應商與物料必須已有供貨關聯（`supplier_materials`）。
  - 內部批次必須屬於指定的收料，供應商批次必須屬於指定的供應商與物料。
  - 供應商帳號僅能存取自己的異常案件（`ensure_supplier_access`）。
  - 附件上傳支援常見格式，儲存時計算 SHA256 驗證碼，記錄檔案大小與媒體類型。
- 狀態轉換：`open` → `investigating` → `dispositioned` → `closed`；更新時需符合狀態流轉規則。
- 權限：讀取需 `nonconformances:read`；寫入需 `nonconformances:write`；附件管理需相同權限。
- ⚠️ 已實作但尚未完整驗證：處置完成條件與強制關聯驗證已在程式碼中實作，但缺少完整自動化測試覆蓋所有邊界狀況。

### 4.11 儀表板與系統健康檢查

- 儀表板（前端）：不呼叫專屬後端端點，直接彙整 `GET /receipts`、`GET /internal-lots`、`GET /iqc`（含 `result=pending`）的分頁 `total`。
  - 顯示：收料紀錄數、內部批號數、IQC 紀錄數、待檢項目數。
  - 依帳號權限決定顯示哪些統計；無對應權限則顯示對應說明。
  - ❌ 已知限制：無良率／不良率／趨勢等 KPI 彙總（原始碼註解亦明確說明不做推算）。
- 健康檢查 API（`backend/app/api/routes/health.py`）：

| 端點                          | 回傳                                                  | 狀態 |
| ----------------------------- | ----------------------------------------------------- | ---- |
| `GET /`                       | `{"message": "SMTMS backend is running"}`（無前綴）   | ✅   |
| `GET /api/v1/health`          | `{"status":"ok","service":"smtms-backend"}`           | ✅   |
| `GET /api/v1/health/live`     | `{"status":"live",...}`                               | ✅   |
| `GET /api/v1/health/ready`    | 檢查 DB 與 Redis，全部 ok 才 `ready`，否則 `degraded` | ⚠️   |
| `GET /api/v1/health/database` | `{"status":"ok"｜"unavailable"}`                      | ⚠️   |
| `GET /api/v1/health/redis`    | `{"status":"ok"｜"unavailable"}`                      | ⚠️   |
| `GET /api/v1/ready`           | 同 `health/ready` 的別名                              | ⚠️   |

> DB 檢查執行 `SELECT 1`；Redis 檢查執行 `PING`；兩者皆以 try/except 包覆，異常時回 `unavailable`（不回 5xx）。⚠️ 現有測試僅斷言回應含 `status` 鍵，未在真實 MySQL／Redis 下驗證 ready／degraded 語意。

---

## 5. 核心業務規則與不變條件

### 5.1 數量驗證規則
- 收料數量驗證：建立收料時無直接驗證供應商批次剩餘數量，但內部拆批時會強制驗證拆分總量不得超過收料的 `qty_remaining`（`backend/app/api/routes/receipts.py`）✅ 已實作
- 內部拆批數量：`POST /receipts/{id}/internal-lots` 驗證所有批次的數量總和 ≤ `receipt.qty_remaining`，驗證失敗返回 400 ❌ 僅有程式碼實作，缺少自動化測試
- 關聯一致性：所有關聯的實體（供應商、物料、批次）必須彼此匹配，由 `_validate_links` 函數統一驗證（`backend/app/api/routes/nonconformances.py`）✅ 已實作且有測試覆蓋

### 5.2 流程狀態規則
- IQC 檢驗結果與放行狀態必須配對：`passed↔released`、`pending↔hold`、`failed↔rejected`（`backend/app/api/routes/quality.py`）✅ 已實作
- 品保審核流程：IQC 記錄建立後需經品保審核，可選擇 `approved`/`rejected`/`requested_rework` 三種動作 ✅ 已實作
- 品質異常狀態流轉：`open` → `investigating` → `dispositioned` → `closed`，更新時需符合順序 ⚠️ 程式碼有狀態欄位，但缺少強制的狀態轉換驗證

### 5.3 追溯查詢功能
- 前端實作：`frontend/src/pages/TraceabilityPage.tsx` 實現追溯查詢頁面 ✅ 已實作
- 支援的搜尋條件：可依收料單號、供應商批號、內部批號、IQC 編號、物料代碼五種識別符查詢完整追溯鏈 ✅ 已實作
- CSV 匯出：✅ 已實作前端匯出功能，`frontend/src/lib/traceabilityCsv.ts` 的 `buildTraceabilityPageCsv` 負責格式化，僅匯出當前查詢分頁的結果
- 匯出限制：僅前端實作匯出邏輯，後端未提供批量匯出 API，僅能匯出當前頁面20筆資料
- 分頁功能：所有清單 API 都支援分頁參數（page、page_size），預設每頁20筆，最多100筆 ✅ 已實作

---

## 6. 流程與狀態轉換

### 6.1 收料與內部拆批流程
```mermaid
stateDiagram-v2
    [*] --> 供應商批次建立: 手動建立供應商批次
    供應商批次建立 --> 收料登錄: 依批次建立收料記錄
    收料登錄 --> 內部拆批: 收料數量可拆分
    內部拆批 --> [*]: 產生多個內部批次
```

### 6.2 IQC 檢驗及品保審核流程
```mermaid
stateDiagram-v2
    [*] --> 待檢驗: 內部批次建立後進入隔離
    待檢驗 --> 檢驗中: 開始IQC檢驗
    檢驗中 --> 品保審核: 完成檢驗提交結果
    品保審核 --> 已放行: 審核通過
    品保審核 --> 已拒收: 審核失敗
    品保審核 --> 待重檢: 要求重新檢驗
```

### 6.3 品質異常案件與處置流程
```mermaid
stateDiagram-v2
    [*] --> open: 建立品質異常案件（初始狀態）
    open --> investigating: 開始調查（僅能從open轉換）
    investigating --> pending_confirmation: 提交待確認（僅能從investigating轉換）
    pending_confirmation --> investigating: 退回調查
    pending_confirmation --> closed: 案件結案（需先填寫調查報告與至少一筆處置）
```
- 狀態強制驗證：`backend/app/api/routes/nonconformances.py` 第399-420行，後端程式碼明確限制狀態轉換路徑，非法轉換會返回409錯誤。
- 結案必要條件：必須完成調查報告(`investigation`)並至少建立一個處置(`NonconformanceDispositionORM`)才能關閉案件。✅ 已完整驗證

---

## 7. 測試與驗證

### 7.1 現有測試覆蓋
依 `backend/tests/` 目錄的測試檔案，目前有以下測試範圍：
- JWT 與 RBAC 權限驗證：`test_jwt_rbac.py` ✅ 有測試案例
- 供應商資料隔離：`test_supplier_isolation.py` ✅ 有測試案例，驗證跨供應商存取被拒
- 品質工作流程 API：`test_quality_workflow_api.py` ✅ 包含 IQC 與品質異常的基本測試
- 目錄API 存取控制：`test_access_control_api.py` ✅ 驗證API權限控制
- 基礎設施健康檢查：`test_infrastructure.py` ✅ 驗證健康檢查端點
- 供應商匯入功能：`test_supplier_import.py` ⚠️ 僅有基本測試
- 開發環境種子資料：`test_seed_dev.py` ✅ 驗證開發帳號正常建立

### 7.2 前端測試
- 前端組件測試：`AdminPage.test.tsx`、`CatalogPages.test.tsx`、`NonconformancePage.test.tsx` ✅ 有基本的組件測試
- TypeScript 型別檢查：可透過 `npm run typecheck` 執行 ⚠️ 未在CI中自動執行
- 前端建置：`npm run build` 可正常產生生產版本 ✅ 本地驗證通過

### 7.3 CI 流程
依 `.github/workflows/ci.yml`，目前CI會執行：
- 後端依賴安裝與 pytest 測試
- 前端依賴安裝與建置驗證
- 程式碼格式檢查（ruff）✅ 已實作自動化

---

## 8. 附件與安全限制

### 8.1 檔案儲存現況
- 品質異常附件：已實作上傳、下載、刪除 API，檔案儲存於本地伺服器的 uploads 目錄
- 檔案中繼資料：每個附件記錄原始檔名、媒體類型、檔案大小、SHA256 雜湊值 ✅ 已實作
- 供應商資格文件附件：僅有資料表結構，無完整的上傳下載功能 ⚠️ 部分實作

### 8.2 安全限制（未實作）
- 病毒掃描：❌ 無任何檔案病毒掃描機制
- 外部物件儲存：❌ 僅支援本地儲存，未整合 S3 等雲端儲存
- 檔案內容驗證：❌ 僅檢查副檔名，未驗證檔案真實格式
- 流量限制：❌ 無上傳/下載頻率限制
- 日誌記錄：⚠️ 基本的存取日誌，但缺少完整的稽核軌跡

---

## 9. 已知限制與後續規劃

### 9.1 尚未實作的核心功能
- CAPA 根因分析、矯正與預防措施：❌ 僅有品質異常的基本記錄，缺少完整的CAPA流程
- 生產工單與產品序號追溯：❌ 無法追蹤內部物料實際用於哪個產品
- 完整報表匯出功能：❌ 僅有基本的資料查詢，缺少CSV/PDF匯出
- 郵件通知系統：❌ 無自動化的異常通知與審核提醒
- 使用者自助密碼修改：❌ 僅能透過資料庫直接修改密碼

### 9.2 已部分實作需完善
- 供應商批次管理：僅能查詢，無法透過API建立 ⚠️ 需要完整的CRUD
- 供應商資格文件管理：僅有查詢功能，缺少上傳維護 ⚠️ 需要完整的文件管理
- 使用者與角色管理：僅有權限驗證，缺少管理API ⚠️ 需要使用者管理界面
- 大數據量效能：未經負載測試，大量資料下的查詢效能未知 ⚠️ 需要效能優化

### 9.3 部署與生產準備
- 正式環境部署：❌ 僅有開發環境的Docker Compose設定
- 負載測試：❌ 從未執行過效能與負載測試
- 法規符合性：❌ 未驗證符合任何產業標準或法規要求
- 備份與還原：⚠️ 僅有資料庫基本備份，缺少完整的災難還原計劃

---

## 10. 核心資料模型

> 全部欄位依 `backend/alembic/versions/20261019_create_user_auth_tables.py`、`20261019_add_mysql_comments_first_schema.py` 與 `backend/app/models/*.py` 核對。
> 注意：MySQL 端主鍵**非 AUTO_INCREMENT**，ID 由應用程式以「目前最大值 + 1」配置（`_next_id`），Seeder 亦同。所有表皆無資料庫層 CHECK／ENUM 條件約束，狀態值以字串儲存。

### 5.1 `users`

| 欄位                    | 型別               | 限制                             |
| ----------------------- | ------------------ | -------------------------------- |
| id                      | INT                | PK                               |
| username                | VARCHAR(80)        | NOT NULL、UNIQUE、INDEX          |
| email                   | VARCHAR(255)       | NULL、INDEX                      |
| password_hash           | VARCHAR(255)       | NOT NULL（bcrypt）               |
| is_active               | TINYINT(1)/BOOLEAN | NOT NULL、預設 1                 |
| created_at / updated_at | DATETIME           | NOT NULL、預設 CURRENT_TIMESTAMP |

關係：1–N `user_roles`。

### 5.2 `roles`

| 欄位                    | 型別         | 限制                    |
| ----------------------- | ------------ | ----------------------- |
| id                      | INT          | PK                      |
| name                    | VARCHAR(80)  | NOT NULL、UNIQUE、INDEX |
| description             | VARCHAR(255) | NULL                    |
| created_at / updated_at | DATETIME     | NOT NULL                |

### 5.3 `permissions`

| 欄位                    | 型別         | 限制                    |
| ----------------------- | ------------ | ----------------------- |
| id                      | INT          | PK                      |
| code                    | VARCHAR(80)  | NOT NULL、UNIQUE、INDEX |
| name                    | VARCHAR(120) | NOT NULL、INDEX         |
| description             | VARCHAR(255) | NULL                    |
| created_at / updated_at | DATETIME     | NOT NULL                |

### 5.4 `user_roles`

| 欄位       | 型別     | 限制                             |
| ---------- | -------- | -------------------------------- |
| id         | INT      | PK                               |
| user_id    | INT      | NOT NULL、FK → `users.id`、INDEX |
| role_id    | INT      | NOT NULL、FK → `roles.id`、INDEX |
| created_at | DATETIME | NOT NULL                         |

限制：UNIQUE(`user_id`,`role_id`)。

### 5.5 `role_permissions`

| 欄位          | 型別     | 限制                                   |
| ------------- | -------- | -------------------------------------- |
| id            | INT      | PK                                     |
| role_id       | INT      | NOT NULL、FK → `roles.id`、INDEX       |
| permission_id | INT      | NOT NULL、FK → `permissions.id`、INDEX |
| created_at    | DATETIME | NOT NULL                               |

限制：UNIQUE(`role_id`,`permission_id`)。

### 5.6 `suppliers`

| 欄位                    | 型別         | 限制                           |
| ----------------------- | ------------ | ------------------------------ |
| id                      | INT          | PK                             |
| supplier_code           | VARCHAR(80)  | NOT NULL、UNIQUE、INDEX        |
| supplier_name           | VARCHAR(200) | NOT NULL、INDEX                |
| contact_name            | VARCHAR(120) | NULL                           |
| phone                   | VARCHAR(40)  | NULL                           |
| email                   | VARCHAR(160) | NULL                           |
| status                  | VARCHAR(20)  | NOT NULL、預設 `active`、INDEX |
| address                 | VARCHAR(255) | NULL                           |
| country                 | VARCHAR(80)  | NULL                           |
| created_at / updated_at | DATETIME     | NOT NULL                       |

`status` 允許值：**無 DB 約束**；程式與 Seeder 實際使用 `active`（`inactive` 見測試）。

### 5.7 `supplier_qualification_documents`

| 欄位                   | 型別         | 限制                                 |
| ---------------------- | ------------ | ------------------------------------ |
| id                     | INT          | PK                                   |
| supplier_id            | INT          | NOT NULL、FK → `suppliers.id`、INDEX |
| doc_type               | VARCHAR(50)  | NOT NULL、INDEX                      |
| doc_code               | VARCHAR(80)  | NULL                                 |
| doc_name               | VARCHAR(200) | NOT NULL                             |
| file_path              | VARCHAR(255) | NULL                                 |
| issued_at / expires_at | DATETIME     | NULL                                 |
| approved_by_user_id    | INT          | NULL、FK → `users.id`、INDEX         |
| status                 | VARCHAR(20)  | NOT NULL、預設 `active`、INDEX       |
| created_at             | DATETIME     | NOT NULL                             |

`status` 實際使用：`active`、`expiring`、`expired`（Seeder）。無 API 可寫入。

### 5.8 `materials`

| 欄位                    | 型別         | 限制                           |
| ----------------------- | ------------ | ------------------------------ |
| id                      | INT          | PK                             |
| material_code           | VARCHAR(80)  | NOT NULL、UNIQUE、INDEX        |
| material_name           | VARCHAR(200) | NOT NULL、INDEX                |
| material_type           | VARCHAR(50)  | NOT NULL、INDEX                |
| spec                    | VARCHAR(255) | NULL                           |
| uom                     | VARCHAR(30)  | NOT NULL                       |
| status                  | VARCHAR(20)  | NOT NULL、預設 `active`、INDEX |
| created_at / updated_at | DATETIME     | NOT NULL                       |

### 5.9 `supplier_materials`

| 欄位                   | 型別        | 限制                                 |
| ---------------------- | ----------- | ------------------------------------ |
| id                     | INT         | PK                                   |
| supplier_id            | INT         | NOT NULL、FK → `suppliers.id`、INDEX |
| material_id            | INT         | NOT NULL、FK → `materials.id`、INDEX |
| supplier_material_code | VARCHAR(80) | NULL、INDEX                          |
| is_preferred           | TINYINT(1)  | NOT NULL、預設 0                     |
| created_at             | DATETIME    | NOT NULL                             |

限制：UNIQUE(`supplier_id`,`material_id`)。

### 5.10 `supplier_lots`

| 欄位                             | 型別          | 限制                                 |
| -------------------------------- | ------------- | ------------------------------------ |
| id                               | INT           | PK                                   |
| supplier_id                      | INT           | NOT NULL、FK → `suppliers.id`、INDEX |
| material_id                      | INT           | NOT NULL、FK → `materials.id`、INDEX |
| supplier_lot_no                  | VARCHAR(120)  | NOT NULL、INDEX                      |
| manufacturing_date / expiry_date | DATETIME      | NULL                                 |
| qty_received                     | DECIMAL(18,4) | NOT NULL、預設 0                     |
| uom                              | VARCHAR(30)   | NOT NULL                             |
| qc_status                        | VARCHAR(20)   | NOT NULL、預設 `received`、INDEX     |
| created_at                       | DATETIME      | NOT NULL                             |

限制：UNIQUE(`supplier_id`,`material_id`,`supplier_lot_no`)。
`qc_status` 實際使用：`received`（預設）、`passed`／`pending`／`failed`（Seeder）；無 API 可寫入。

### 5.11 `material_receipts`

| 欄位                | 型別          | 限制                                     |
| ------------------- | ------------- | ---------------------------------------- |
| id                  | INT           | PK                                       |
| supplier_id         | INT           | NOT NULL、FK → `suppliers.id`、INDEX     |
| material_id         | INT           | NOT NULL、FK → `materials.id`、INDEX     |
| supplier_lot_id     | INT           | NOT NULL、FK → `supplier_lots.id`、INDEX |
| receipt_no          | VARCHAR(80)   | NOT NULL、UNIQUE、INDEX                  |
| received_at         | DATETIME      | NOT NULL、INDEX                          |
| received_by_user_id | INT           | NULL、FK → `users.id`、INDEX             |
| qty_received        | DECIMAL(18,4) | NOT NULL、預設 0                         |
| qty_remaining       | DECIMAL(18,4) | NOT NULL、預設 0                         |
| status              | VARCHAR(20)   | NOT NULL、預設 `received`、INDEX         |
| notes               | VARCHAR(500)  | NULL                                     |
| created_at          | DATETIME      | NOT NULL                                 |

`status` 實際僅使用 `received`（建立後不再變更）。

### 5.12 `internal_material_lots`

| 欄位            | 型別          | 限制                                         |
| --------------- | ------------- | -------------------------------------------- |
| id              | INT           | PK                                           |
| material_id     | INT           | NOT NULL、FK → `materials.id`、INDEX         |
| supplier_lot_id | INT           | **NULL**、FK → `supplier_lots.id`、INDEX     |
| receipt_id      | INT           | **NULL**、FK → `material_receipts.id`、INDEX |
| internal_lot_no | VARCHAR(120)  | NOT NULL、INDEX                              |
| qty_on_hand     | DECIMAL(18,4) | NOT NULL、預設 0                             |
| qty_reserved    | DECIMAL(18,4) | NOT NULL、預設 0                             |
| uom             | VARCHAR(30)   | NOT NULL                                     |
| lot_status      | VARCHAR(20)   | NOT NULL、預設 `available`、INDEX            |
| expiry_date     | DATETIME      | NULL                                         |
| created_at      | DATETIME      | NOT NULL                                     |

限制：UNIQUE(`material_id`,`internal_lot_no`)。
`lot_status` 實際使用：`available`（預設）、`quarantine`（拆分後）、`rejected`（IQC failed）。

### 5.13 `iqc_records`

| 欄位              | 型別          | 限制                                              |
| ----------------- | ------------- | ------------------------------------------------- |
| id                | INT           | PK                                                |
| receipt_id        | INT           | **NULL**、FK → `material_receipts.id`、INDEX      |
| internal_lot_id   | INT           | **NULL**、FK → `internal_material_lots.id`、INDEX |
| inspector_user_id | INT           | NOT NULL、FK → `users.id`、INDEX                  |
| sample_qty        | DECIMAL(18,4) | NOT NULL                                          |
| inspection_result | VARCHAR(20)   | NOT NULL、`pending`/`passed`/`failed`            |
| release_status    | VARCHAR(20)   | NOT NULL、`hold`/`released`/`rejected`            |
| inspection_date   | DATETIME      | NOT NULL、預設 CURRENT_TIMESTAMP                  |
| remarks           | VARCHAR(500)  | NULL                                              |
| created_at / updated_at | DATETIME | NOT NULL                                         |

### 5.14 `quality_reviews`（品保審核）

| 欄位              | 型別         | 限制                                              |
| ----------------- | ------------ | ------------------------------------------------- |
| id                | INT          | PK                                                |
| iqc_record_id     | INT          | NOT NULL、FK → `iqc_records.id`、INDEX            |
| reviewer_user_id  | INT          | NOT NULL、FK → `users.id`、INDEX                  |
| review_action     | VARCHAR(20)  | NOT NULL、`approved`/`rejected`/`requested_rework` |
| review_notes      | VARCHAR(500) | NULL                                              |
| reviewed_at       | DATETIME     | NOT NULL、預設 CURRENT_TIMESTAMP                  |

### 5.15 `nonconformances`（品質異常案件）

| 欄位              | 型別          | 限制                                              |
| ----------------- | ------------- | ------------------------------------------------- |
| id                | INT           | PK                                                |
| case_no           | VARCHAR(80)   | NOT NULL、UNIQUE、INDEX                           |
| title             | VARCHAR(200)  | NOT NULL                                          |
| description       | TEXT          | NOT NULL                                          |
| source            | VARCHAR(50)   | NOT NULL、IQC/線上/客訴/其他                      |
| severity          | VARCHAR(20)   | NOT NULL、critical/major/minor                    |
| status            | VARCHAR(30)   | NOT NULL、預設 `open`、INDEX                      |
| found_at          | DATETIME      | NOT NULL                                          |
| found_by_user_id  | INT           | NOT NULL、FK → `users.id`、INDEX                  |
| owner_user_id     | INT           | NULL、FK → `users.id`、INDEX                      |
| supplier_id       | INT           | NULL、FK → `suppliers.id`、INDEX                  |
| material_id       | INT           | NULL、FK → `materials.id`、INDEX                  |
| receipt_id        | INT           | NULL、FK → `material_receipts.id`、INDEX          |
| supplier_lot_id   | INT           | NULL、FK → `supplier_lots.id`、INDEX              |
| internal_lot_id   | INT           | NULL、FK → `internal_material_lots.id`、INDEX     |
| iqc_record_id     | INT           | NULL、FK → `iqc_records.id`、INDEX                |
| defect_qty        | DECIMAL(18,4) | NULL                                              |
| investigation     | TEXT          | NULL                                              |
| closed_at         | DATETIME      | NULL                                              |
| created_at / updated_at | DATETIME | NOT NULL                                         |

### 5.16 `nonconformance_dispositions`（異常處置）

| 欄位              | 型別         | 限制                                              |
| ----------------- | ------------ | ------------------------------------------------- |
| id                | INT          | PK                                                |
| nonconformance_id | INT          | NOT NULL、FK → `nonconformances.id`、INDEX        |
| content           | TEXT         | NOT NULL                                          |
| result            | VARCHAR(50)  | NOT NULL、特采/報廢/重工/退貨/其他                |
| owner_user_id     | INT          | NOT NULL、FK → `users.id`、INDEX                  |
| executed_at       | DATETIME     | NOT NULL                                          |
| created_at        | DATETIME     | NOT NULL                                         |

### 5.17 `nonconformance_history`（異常歷程）

| 欄位              | 型別         | 限制                                              |
| ----------------- | ------------ | ------------------------------------------------- |
| id                | INT          | PK                                                |
| nonconformance_id | INT          | NOT NULL、FK → `nonconformances.id`、INDEX        |
| action            | VARCHAR(100) | NOT NULL                                          |
| actor_user_id     | INT          | NOT NULL、FK → `users.id`、INDEX                  |
| before_data       | JSON         | NULL                                              |
| after_data        | JSON         | NOT NULL                                          |
| created_at        | DATETIME     | NOT NULL                                         |

### 5.18 `nonconformance_attachments`（異常附件）

| 欄位              | 型別         | 限制                                              |
| ----------------- | ------------ | ------------------------------------------------- |
| id                | INT          | PK                                                |
| nonconformance_id | INT          | NOT NULL、FK → `nonconformances.id`、INDEX        |
| original_filename | VARCHAR(255) | NOT NULL                                          |
| media_type        | VARCHAR(100) | NOT NULL                                          |
| size_bytes        | BIGINT       | NOT NULL                                          |
| sha256            | CHAR(64)     | NOT NULL、UNIQUE                                  |
| file_path         | VARCHAR(255) | NOT NULL                                          |
| created_at        | DATETIME     | NOT NULL                                         |

### 5.19 `supplier_document_attachments`（供應商文件附件）

| 欄位              | 型別         | 限制                                              |
| ----------------- | ------------ | ------------------------------------------------- |
| id                | INT          | PK                                                |
| document_id       | INT          | NOT NULL、FK → `supplier_qualification_documents.id`、INDEX |
| original_filename | VARCHAR(255) | NOT NULL                                          |
| media_type        | VARCHAR(100) | NOT NULL                                          |
| size_bytes        | BIGINT       | NOT NULL                                          |
| sha256            | CHAR(64)     | NOT NULL、UNIQUE                                  |
| file_path         | VARCHAR(255) | NOT NULL                                          |
| created_at        | DATETIME     | NOT NULL                                         |
| inspector_user_id | INT           | NULL、FK → `users.id`、INDEX                      |
| sample_qty        | DECIMAL(18,4) | NOT NULL、預設 0                                  |
| inspection_result | VARCHAR(20)   | NOT NULL、預設 `pending`、INDEX                   |
| inspection_date   | DATETIME      | NULL                                              |
| release_status    | VARCHAR(20)   | NOT NULL、預設 `hold`、INDEX                      |
| remarks           | VARCHAR(500)  | NULL                                              |
| created_at        | DATETIME      | NOT NULL                                          |

`inspection_result`：`pending`／`passed`／`failed`。`release_status`：`hold`／`released`／`rejected`。

### 5.14 完整資料追溯關係

```
permissions ─┬─ role_permissions ─ roles ─ user_roles ─ users
             └─ (users 亦被 supplier_qualification_documents / material_receipts / iqc_records 參照)

suppliers ─┬─ supplier_qualification_documents
           ├─ supplier_materials ─ materials
           ├─ supplier_lots ─ materials
           └─ material_receipts ─ materials, supplier_lots
                    ├─ internal_material_lots（receipt_id, supplier_lot_id, material_id）
                    └─ iqc_records（receipt_id）
                              └─ internal_material_lots（internal_lot_id）
```

外鍵層級（由 `20261019_add_mysql_comments_first_schema` 重新建立）已涵蓋上表所有關係。

**目前尚未建立或無法完整追溯的部分：**

- ❌ `supplier_lots` 無建立 API，無法由系統前端產生；追溯鏈最上游在 API 層為斷點。
- ❌ `internal_material_lots.qty_on_hand` 於建立後不再扣減，無出庫／領用紀錄，庫存異動無法追溯。
- ❌ IQC 結果**不會回寫** `supplier_lots.qc_status` 或 `material_receipts.status`，批次層狀態與檢驗層狀態可能不一致。
- ❌ 無「由物料／批次反查完整履歷」的專用追溯 API；現有僅為各表清單與明細查詢。
- ❌ 無稽核軌跡（audit log）：僅有 `received_by_user_id`、`inspector_user_id`、`approved_by_user_id` 三個欄位，無異動歷程。

---

## 6. 品保業務流程

以下依實際路由與程式邏輯描述。

1. **建立與管理供應商**：`POST /suppliers` 建立，`PATCH` 維護；`supplier_code` 唯一。
2. **建立物料並設定供應商關聯**：`POST /materials` 建立物料；`POST /suppliers/{id}/materials` 建立供貨關聯（可設首選）。
3. **建立供應商批次**：❌ **無 API**。`supplier_lots` 目前僅能由 Seeder 或外部 SQL 產生。
4. **建立收料**：`POST /receipts`，需引用既有 `supplier_lot_id`，並通過供應商／物料／供應商批次一致性與供貨關聯檢查；成功後 `qty_remaining = qty_received`、`status = received`。
5. **關聯供應商批次**：收料即綁定 `supplier_lot_id`，並由該批次帶出物料與效期；此外 `internal_material_lots.supplier_lot_id` 亦沿用收料之供應商批次。
6. **拆分為內部物料批次**：`POST /receipts/{id}/internal-lots`，累計拆分量不得超過 `qty_remaining`，成功後扣減剩餘量，新批次一律 `quarantine`。
7. **執行 IQC**：`POST /iqc`（或 `PATCH /iqc/{id}`），結果與放行狀態需成對，建立後依規則更新內部批次 `lot_status`。
8. **查詢追溯資訊**：`GET /receipts`、`GET /internal-lots`、`GET /internal-lots/{id}`、`GET /iqc`、`GET /supplier-lots`，前端以清單／明細呈現。

### 特別確認項目

| 項目                   | 實際行為                                                                                               | 狀態                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 批次數量與拆分數量限制 | 每筆拆分 `qty > 0`；累計拆分 ≤ `receipt.qty_remaining`；`qty_received` 必 > 0                          | ✅（`quality.py`、`schemas/catalog.py`；測試涵蓋拆分成功） |
| 重複建立資料的處理     | 供應商代碼、物料代碼、收料單號、供貨關聯、內部批號重複 → 409                                           | ✅（DB UNIQUE + 應用層檢查）                               |
| 檢驗人員的來源         | 一律為目前登入者（`current_user.id`）；更新時不可指定他人                                              | ✅                                                         |
| 檢驗結果與狀態轉換規則 | `passed→released→available`、`pending→hold→quarantine`、`failed→rejected→rejected`；不符配對回 400/422 | ✅（測試涵蓋 passed 後改 failed 之更新）                   |
| 交易處理與失敗回滾     | 供應商／物料／收料／拆分：以 `db.commit()` 為界，`IntegrityError` 回滾並轉 409                         | ⚠️ IQC 建立為兩段 commit，非單一交易                       |
| 不合格品處理           | ❌ 未實作（僅有 `failed`／`rejected` 狀態值）                                                          | ❌                                                         |
| 隔離                   | ⚠️ 部分：拆分後批次自動進 `quarantine`；無獨立隔離單流程                                               | ⚠️                                                         |
| 退貨                   | ❌ 未實作                                                                                              | ❌                                                         |
| 讓步接收（concession） | ❌ 未實作                                                                                              | ❌                                                         |

---

## 7. 業務不變條件

| #   | 不變條件                                           | 實作位置                                                           | 測試證據                                                           | 狀態       |
| --- | -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------- |
| 1   | 供應商代碼唯一                                     | `suppliers.py` create/update、DB UNIQUE                            | `test_catalog_api.py::test_supplier_crud_...`（409）               | ✅         |
| 2   | 物料代碼唯一                                       | `materials.py` create/update、DB UNIQUE                            | `test_catalog_api.py::test_material_crud_...`（409）               | ✅         |
| 3   | 供貨關聯唯一                                       | `suppliers.py` add_supplier_material、DB UNIQUE                    | `test_catalog_api.py::test_supplier_material_...`（409）           | ✅         |
| 4   | 同一物料僅一筆首選供應商                           | `suppliers.py`（is_preferred=True 時重設同物料其他關聯）           | `test_supplier_material_...`（驗證僅 1 筆 preferred）              | ✅         |
| 5   | 收料引用之供應商／物料／供應商批次必須存在         | `quality.py::create_receipt`                                       | ⚠️ 缺測試（404 分支未涵蓋）                                        | ⚠️         |
| 6   | 供應商批次須屬於該供應商與物料                     | `quality.py::create_receipt`（400）                                | ⚠️ 缺測試                                                          | ⚠️         |
| 7   | 供應商需已與物料建立供貨關聯                       | `quality.py::create_receipt`（400）                                | ⚠️ 缺測試                                                          | ⚠️         |
| 8   | 收料單號唯一                                       | DB UNIQUE + 應用層（409）                                          | ⚠️ 缺測試                                                          | ⚠️         |
| 9   | 收料數量必 > 0                                     | `ReceiptCreate.qty_received(gt=0)` + 路由檢查                      | ⚠️ 缺測試                                                          | ⚠️         |
| 10  | 拆分總量不得超過收料剩餘數量                       | `quality.py::split_receipt_into_internal_lots`                     | ⚠️ 缺測試                                                          | ⚠️         |
| 11  | 每筆拆分數量必 > 0                                 | 同上 + `InternalLotCreate.qty(gt=0)`                               | ⚠️ 缺測試                                                          | ⚠️         |
| 12  | 內部批號（同物料）唯一                             | DB UNIQUE(`material_id`,`internal_lot_no`) + 應用層全域檢查（409） | ⚠️ 缺測試                                                          | ⚠️         |
| 13  | IQC 必須關聯收料或內部批次                         | `IQCCreate.validate_reference`                                     | ⚠️ 缺測試                                                          | ⚠️         |
| 14  | IQC 同時指定收料與批次時，兩者須互相對應且物料一致 | `quality.py::create_iqc_record`                                    | ⚠️ 缺測試                                                          | ⚠️         |
| 15  | 檢驗結果與放行狀態必須成對                         | `IQCCreate`/`IQCUpdate` validator + 路由                           | `test_quality_workflow_api.py`（passed/released、failed/rejected） | ✅（部分） |
| 16  | 檢驗人員固定為目前登入者                           | `quality.py`（create/update）                                      | `test_quality_workflow_api.py`（assert inspector_user_id==1）      | ✅（建立） |
| 17  | IQC 結果須反映至內部批次狀態                       | `quality.py::_relationship_status_for_iqc`                         | `test_quality_workflow_api.py`（lot_status==available）            | ✅（部分） |
| 18  | 未登入者不可存取受保護端點                         | `get_current_token_claims`                                         | `test_jwt_rbac.py`、`test_catalog_api.py`（401）                   | ✅         |
| 19  | 權限不足者不可存取                                 | `require_permission`                                               | `test_jwt_rbac.py`、`test_catalog_api.py`（403）                   | ✅         |
| 20  | Token 撤銷後不可再用                               | `revoke_access_token` + Redis 檢查                                 | `test_jwt_rbac.py::test_logout_revokes_token`                      | ✅         |
| 21  | Redis 不可用時不得放行驗證                         | `get_current_token_claims`（503）                                  | ⚠️ 缺測試                                                          | ⚠️         |
| 22  | 拆分與收料需以交易提交，失敗回滾                   | `quality.py` try/except + rollback                                 | ⚠️ 缺測試                                                          | ⚠️         |

> 未標示測試證據者一律視為「已實作但尚未完整驗證」，不得宣稱已受保證。

---

## 8. API 規格索引

- 前綴：`/api/v1`（`API_V1_STR`）；根路徑 `GET /` 例外。
- 互動式文件：`/docs`（Swagger UI）、`/redoc`；機器可讀：`/openapi.json`。完整 Schema 以 OpenAPI 為準，本節僅列索引。
- 認證：除 `POST /auth/login` 與健康檢查外，皆需 `Authorization: Bearer <token>`。

| #   | Method | Path                                                      | 功能                  | 認證 | 所需權限            | Request Schema                                                     | Response Schema                          | 主要錯誤                     |
| --- | ------ | --------------------------------------------------------- | --------------------- | ---- | ------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------- |
| 1   | GET    | `/`                                                       | 服務啟動檢查          | 否   | —                   | —                                                                  | `{message}`                              | —                            |
| 2   | GET    | `/api/v1/health`                                          | 基本健康              | 否   | —                   | —                                                                  | `{status,service}`                       | —                            |
| 3   | GET    | `/api/v1/health/live`                                     | Liveness              | 否   | —                   | —                                                                  | `{status,service}`                       | —                            |
| 4   | GET    | `/api/v1/health/ready`                                    | Readiness（DB+Redis） | 否   | —                   | —                                                                  | `{status,checks}`                        | —                            |
| 5   | GET    | `/api/v1/health/database`                                 | DB 狀態               | 否   | —                   | —                                                                  | `{status}`                               | —                            |
| 6   | GET    | `/api/v1/health/redis`                                    | Redis 狀態            | 否   | —                   | —                                                                  | `{status}`                               | —                            |
| 7   | GET    | `/api/v1/ready`                                           | Readiness 別名        | 否   | —                   | —                                                                  | `{status,checks}`                        | —                            |
| 8   | POST   | `/api/v1/auth/login`                                      | 登入                  | 否   | —                   | `LoginRequest`                                                     | `TokenResponse`                          | 401、422                     |
| 9   | POST   | `/api/v1/auth/logout`                                     | 登出／撤銷 Token      | 是   | —（僅需有效 Token） | —                                                                  | `LogoutResponse`                         | 401、503                     |
| 10  | GET    | `/api/v1/auth/me`                                         | 目前使用者            | 是   | —                   | —                                                                  | `UserProfile`                            | 401、503                     |
| 11  | GET    | `/api/v1/suppliers`                                       | 供應商清單            | 是   | `suppliers:read`    | Query: keyword/status/page/page_size                               | `PaginatedResponse[SupplierResponse]`    | 401、403、422                |
| 12  | POST   | `/api/v1/suppliers`                                       | 建立供應商            | 是   | `suppliers:write`   | `SupplierCreate`                                                   | `SupplierResponse`                       | 401、403、409、422           |
| 13  | GET    | `/api/v1/suppliers/{supplier_id}`                         | 供應商明細            | 是   | `suppliers:read`    | Path                                                               | `SupplierResponse`                       | 401、403、404                |
| 14  | PATCH  | `/api/v1/suppliers/{supplier_id}`                         | 更新供應商            | 是   | `suppliers:write`   | `SupplierUpdate`                                                   | `SupplierResponse`                       | 401、403、404、409、422      |
| 15  | GET    | `/api/v1/suppliers/{supplier_id}/documents`               | 資格文件清單          | 是   | `suppliers:read`    | Path                                                               | `list[SupplierDocumentResponse]`         | 401、403、404                |
| 16  | POST   | `/api/v1/suppliers/{supplier_id}/materials`               | 建立供貨關聯          | 是   | `suppliers:write`   | `SupplierMaterialCreate`                                           | `SupplierMaterialResponse`               | 401、403、404、409、422      |
| 17  | DELETE | `/api/v1/suppliers/{supplier_id}/materials/{material_id}` | 刪除供貨關聯          | 是   | `suppliers:write`   | Path                                                               | 204 無內容                               | 401、403、404                |
| 18  | GET    | `/api/v1/materials`                                       | 物料清單              | 是   | `materials:read`    | Query: keyword/status/page/page_size                               | `PaginatedResponse[MaterialResponse]`    | 401、403、422                |
| 19  | POST   | `/api/v1/materials`                                       | 建立物料              | 是   | `materials:write`   | `MaterialCreate`                                                   | `MaterialResponse`                       | 401、403、409、422           |
| 20  | GET    | `/api/v1/materials/{material_id}`                         | 物料明細              | 是   | `materials:read`    | Path                                                               | `MaterialResponse`                       | 401、403、404                |
| 21  | PATCH  | `/api/v1/materials/{material_id}`                         | 更新物料              | 是   | `materials:write`   | `MaterialUpdate`                                                   | `MaterialResponse`                       | 401、403、404、409、422      |
| 22  | GET    | `/api/v1/materials/{material_id}/suppliers`               | 物料之供應商          | 是   | `materials:read`    | Path                                                               | `list[SupplierResponse]`                 | 401、403、404                |
| 23  | GET    | `/api/v1/receipts`                                        | 收料清單              | 是   | `receipts:read`     | Query: keyword/status/date_from/date_to/page/page_size             | `PaginatedResponse[ReceiptResponse]`     | 401、403、422                |
| 24  | POST   | `/api/v1/receipts`                                        | 建立收料              | 是   | `receipts:write`    | `ReceiptCreate`                                                    | `ReceiptResponse`                        | 400、401、403、404、409、422 |
| 25  | GET    | `/api/v1/receipts/{receipt_id}`                           | 收料明細              | 是   | `receipts:read`     | Path                                                               | `ReceiptResponse`                        | 401、403、404                |
| 26  | POST   | `/api/v1/receipts/{receipt_id}/internal-lots`             | 拆分內部批次          | 是   | `receipts:write`    | `InternalLotCreate` ｜ `list[InternalLotCreate]` ｜ `{lots:[...]}` | `InternalLotResponse`（僅第一筆）        | 400、401、403、404、409、422 |
| 27  | GET    | `/api/v1/supplier-lots`                                   | 供應商批次清單        | 是   | `suppliers:read`    | Query: keyword/status/date_from/date_to/page/page_size             | `PaginatedResponse[SupplierLotResponse]` | 401、403、422                |
| 28  | GET    | `/api/v1/internal-lots`                                   | 內部批次清單          | 是   | `materials:read`    | Query: keyword/status/date_from/date_to/page/page_size             | `PaginatedResponse[InternalLotResponse]` | 401、403、422                |
| 29  | GET    | `/api/v1/internal-lots/{internal_lot_id}`                 | 內部批次明細          | 是   | `materials:read`    | Path                                                               | `InternalLotResponse`                    | 401、403、404                |
| 30  | GET    | `/api/v1/iqc`                                             | IQC 清單              | 是   | `iqc:read`          | Query: keyword/result/date_from/date_to/page/page_size             | `PaginatedResponse[IQCRecordResponse]`   | 401、403、422                |
| 31  | POST   | `/api/v1/iqc`                                             | 建立 IQC              | 是   | `iqc:write`         | `IQCCreate`                                                        | `IQCRecordResponse`                      | 400、401、403、404、409、422 |
| 32  | GET    | `/api/v1/iqc/{iqc_id}`                                    | IQC 明細              | 是   | `iqc:read`          | Path                                                               | `IQCRecordResponse`                      | 401、403、404                |
| 33  | PATCH  | `/api/v1/iqc/{iqc_id}`                                    | 更新 IQC              | 是   | `iqc:write`         | `IQCUpdate`                                                        | `IQCRecordResponse`                      | 400、401、403、404、409、422 |

補充：

- 所有清單端點皆採 `page`(≥1)／`page_size`(1–100，預設 20)，關鍵字多為 `ILIKE`（MySQL 下為不分大小寫 LIKE）。
- `GET /api/v1/iqc` 的 `keyword` 僅比對 `remarks`。
- 清單排序一律 `ORDER BY id`。
- Schema 定義集中於 `backend/app/schemas/auth.py` 與 `backend/app/schemas/catalog.py`。

---

## 9. 前端規格

### 9.1 頁面與路由清單

| 路由             | 頁面元件                         | 顯示條件（權限） | 能力                                                                         | 狀態            |
| ---------------- | -------------------------------- | ---------------- | ---------------------------------------------------------------------------- | --------------- |
| `/login`         | `LoginPage`                      | 未登入           | 帳密登入                                                                     | ✅              |
| `/`              | `DashboardPage`                  | 已登入           | 讀取統計摘要                                                                 | ✅              |
| `/suppliers`     | `CatalogPages(kind="suppliers")` | `suppliers:read` | 清單、搜尋、分頁、建立（需 `suppliers:write`）                               | ✅（無編輯 UI） |
| `/materials`     | `CatalogPages(kind="materials")` | `materials:read` | 清單、搜尋、分頁、建立（需 `materials:write`）                               | ✅（無編輯 UI） |
| `/receipts`      | `ReceiptsPage`                   | `receipts:read`  | 清單、明細、建立（需 `receipts:write`）、拆分內部批次（需 `receipts:write`） | ✅              |
| `/internal-lots` | `InternalLotsPage`               | `materials:read` | 清單、搜尋、分頁                                                             | ✅（唯讀）      |
| `/iqc`           | `IQCPage`                        | `iqc:read`       | 清單、建立檢驗（需 `iqc:write`）                                             | ✅（無更新 UI） |
| `*`              | 導向 `/` 或 `/login`             | —                | —                                                                            | ✅              |

### 9.2 登入後導覽流程

1. 進入 `/login`，輸入帳密送出。
2. 登入成功後寫入 `localStorage.smtms_token`，呼叫 `GET /auth/me`，成功才視為登入完成，導向 `/`。
3. 重新整理時若存在 token，會先進入「正在驗證登入狀態…」再決定是否放行。
4. 側邊選單依權限過濾；直接輸入無權限路由會顯示「需要存取權限」畫面（`PermissionPage`）。
5. 登出時呼叫 `POST /auth/logout`（失敗亦會清除本機狀態並回登入頁）。

### 9.3 側邊選單與權限過濾

選單來源 `AppLayout.tsx` 的 `navigation`：

| 選單            | 路徑             | 所需權限         |
| --------------- | ---------------- | ---------------- |
| 儀表板          | `/`              | 無（一律顯示）   |
| 供應商管理      | `/suppliers`     | `suppliers:read` |
| 物料管理        | `/materials`     | `materials:read` |
| 收料紀錄        | `/receipts`      | `receipts:read`  |
| 內部批號        | `/internal-lots` | `materials:read` |
| 進料檢驗（IQC） | `/iqc`           | `iqc:read`       |

### 9.4 API Client 呼叫方式

- `frontend/src/api/client.ts`：以 `fetch` 呼叫，Base URL 取自 `VITE_API_BASE_URL`（未設定時預設 `http://localhost:8000`）。
- 自動附帶 `Authorization: Bearer <token>`；`Content-Type: application/json`。
- 錯誤轉為 `ApiError{status, details}`；401（非登入端點）會清 token 並派送 `smtms:unauthorized`。
- 另有 `loadAllPages()`（`lib/data.ts`）以 `page_size=100` 逐頁抓取全部資料，供收料／IQC 表單的下拉選項使用。
- ❌ 前端未實作：供應商／物料編輯、供貨關聯管理、供應商批號建立、資格文件、IQC 更新。**API 存在但前端未串接者**：`PATCH /suppliers/{id}`、`PATCH /materials/{id}`、`GET /suppliers/{id}/documents`、`POST/DELETE /suppliers/{id}/materials`、`GET /materials/{id}/suppliers`、`PATCH /iqc/{id}`、`GET /iqc/{id}`、`GET /supplier-lots/{id}`（此端點本身亦不存在）。

### 9.5 Loading／空資料／錯誤／成功狀態

- Loading：`LoadingState`（含 aria `role="status"`，如「正在載入供應商資料…」）。
- 空資料：`EmptyState`（如「查無供應商資料」「尚無收料紀錄」）。
- 錯誤：`ErrorState`（含 `role="alert"`，清單載入失敗提供「重試」）。
- 成功：`SuccessMessage` 或 `role="status"` 文字（如「供應商已建立。」）。
- 破壞性／確認操作：`ConfirmDialog`（Radix Dialog），用於建立收料、建立內部批號、儲存檢驗紀錄。

### 9.6 正體中文介面現況

- 介面文字全為繁體中文（台灣用語），狀態值透過 `lib/status.ts` 映射（如 `received→已收料`、`quarantine→待檢隔離`）。
- 程式碼識別字、API 欄位名、資料表名維持英文原名。

### 9.7 前端與後端權限檢查的責任邊界

- 前端：僅做 UI 顯示與導覽過濾，並在呼叫 API 前檢查單一權限；不構成安全防線。
- 後端：所有端點以 `require_permission()` 把關，為唯一授權依據。
- 前端以 `suppliers:read`／`materials:read` 決定是否顯示新增按鈕，但實際寫入仍以後端權限判定（前端可能顯示按鈕但收到 403）。

---

## 10. 非功能性需求與部署

### 10.1 實際依賴版本（範圍式宣告，非固定版號）

後端（`backend/pyproject.toml`，Python `>=3.12,<3.14`）：

| 套件                              | 宣告範圍                                |
| --------------------------------- | --------------------------------------- |
| fastapi                           | `>=0.115.0,<1.0.0`                      |
| uvicorn[standard]                 | `>=0.30.0,<1.0.0`                       |
| pydantic / pydantic-settings      | `>=2.9.0,<3.0.0` / `>=2.5.0,<3.0.0`     |
| SQLAlchemy                        | `>=2.0.0,<3.0.0`                        |
| alembic                           | `>=1.14.0,<2.0.0`                       |
| PyMySQL                           | `>=1.1.0,<2.0.0`                        |
| redis                             | `>=5.0.0,<6.0.0`                        |
| PyJWT                             | `>=2.8.0,<3.0.0`                        |
| bcrypt / passlib[bcrypt]          | `>=4.1.2,<5.0.0` / `>=1.7.4,<2.0.0`     |
| email-validator                   | `>=2.2.0,<3.0.0`                        |
| dev：pytest / ruff / mypy / httpx | `>=8.3` / `>=0.6` / `>=1.11` / `>=0.28` |

前端（`frontend/package.json`）：react `^19.2.8`、react-dom `^19.2.8`、react-router-dom `^7.18.4`、lucide-react `^0.468.0`、tailwindcss `^4.1.14`、@radix-ui/react-dialog `^1.1.15`；dev：typescript `~6.0.2`、vite `^8.3.0`、vitest `^5.0.5`、oxlint `^1.81.0`、jsdom `^29.1.1`、@testing-library/\*。

> 「實際安裝版本」以 `uv.lock`／`package-lock.json` 為準；本文件不逐一列舉鎖定版號。

### 10.2 MySQL 連線方式

- `DATABASE_URL`（預設 `mysql+pymysql://root:root@localhost:3306/smtms`），由 `Settings` 讀取，並會對帳密做 URL 編碼（`sanitize_database_url`）。
- 連線池：`pool_pre_ping=True`、`future=True`；Session 為 `autocommit=False, autoflush=False, expire_on_commit=False`。
- MySQL 為**外部資料庫**，Compose 不管理；容器內 `localhost` 會被 `docker-entrypoint.py` 改寫為 `host.docker.internal`。

### 10.3 Redis 用途

- Token 撤銷名單：`auth:revoked:{jti}`。
- 健康檢查：`PING`。
- 連線參數：`decode_responses=True`、connect/socket timeout 各 5 秒、`health_check_interval=30`。
- 啟動時由 `app_lifespan` 初始化、關閉時釋放；`get_redis_client()` 為惰性初始化。

### 10.4 Docker Compose 服務與連接埠

| 服務     | Image／建置             | 容器連接埠 | 主機連接埠 | 依賴                         |
| -------- | ----------------------- | ---------- | ---------- | ---------------------------- |
| redis    | `redis:7-alpine`        | 6379       | 未對外映射 | —                            |
| backend  | `./backend/Dockerfile`  | 8000       | 8000       | redis（healthy）             |
| frontend | `./frontend/Dockerfile` | 5173       | 5173       | backend（healthy）           |
| nginx    | `nginx:alpine`          | 80         | **8087**   | frontend、backend（healthy） |

- 網路：`smtms-net`（bridge）。
- backend 額外設定 `REDIS_URL=redis://redis:6379/0` 與 `extra_hosts: host.docker.internal:host-gateway`。
- 各服務皆定義 healthcheck；backend 以 `/api/v1/health/live` 檢查。
- ⚠️ 差異：`README.md` 記載 Nginx 連接埠為 `80`，實際 Compose 映射為 `8087:80`（對外存取請用 `http://localhost:8087`）。

### 10.5 Nginx 路由

| location          | 目標                                 | 備註                                                     |
| ----------------- | ------------------------------------ | -------------------------------------------------------- |
| `/api/`           | `http://backend:8000`                | 直接轉發（路徑不重寫）                                   |
| `= /health`       | `http://backend:8000/api/v1/health`  |                                                          |
| `/health/`        | `http://backend:8000/api/v1/health/` | ⚠️ 後端無尾斜線路由，實際會依 FastAPI 尾斜線重導，待確認 |
| `= /docs`         | `http://backend:8000/docs`           | Swagger UI                                               |
| `= /openapi.json` | `http://backend:8000/openapi.json`   |                                                          |
| `/`               | `http://frontend:5173`               | 支援 WebSocket upgrade（Vite HMR）                       |

### 10.6 健康檢查

- Compose 層：redis（`redis-cli ping`）、backend（URL 檢查 `/api/v1/health/live`）、frontend（fetch `/`）、nginx（wget `/`）。
- 應用層：見 4.10。

### 10.7 環境變數與敏感資訊管理

後端（`backend/.env`，範本 `backend/.env.example`）：

| 變數                          | 用途                                      | 預設／範例                                          |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `APP_ENV`                     | 環境別（Seeder 僅允許 development／test） | `development`                                       |
| `APP_NAME`                    | FastAPI title                             | `SMTMS`                                             |
| `APP_DEBUG`                   | 除錯                                      | `true`                                              |
| `API_V1_STR`                  | API 前綴                                  | `/api/v1`                                           |
| `SECRET_KEY`                  | JWT 簽章金鑰（**min_length=32**）         | 需自行產生                                          |
| `ALGORITHM`                   | JWT 演算法                                | `HS256`                                             |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token 壽命（分鐘）                        | `60`                                                |
| `DATABASE_URL`                | MySQL 連線                                | 範例用 `host.docker.internal`                       |
| `REDIS_URL`                   | Redis 連線                                | `redis://redis:6379/0`                              |
| `CORS_ORIGINS`                | 允許來源（支援 JSON 陣列或逗號分隔）      | `["http://localhost:5173","http://127.0.0.1:5173"]` |

前端：`VITE_API_BASE_URL`（Compose 中設為空字串，走同源）。

- 敏感資訊：`.env` 存在於工作區（未讀取其內容），`.gitignore` 應排除；文件不提任何實際密鑰。
- Seeder 密碼可由 `SMTMS_SEED_PASSWORD` 覆寫，預設 `SmtmsLocal2026!`（僅限本機開發／測試）。

### 10.8 本機檔案儲存現況及限制

- ❌ 目前**無檔案儲存實作**：無上傳端點、無掛載 volume、無靜態檔案服務。
- `supplier_qualification_documents.file_path` 僅為字串欄位，資料由 Seeder 寫入示意路徑（如 `seed-documents/suppliers/...`），該路徑對應的實體檔案不存在。

### 10.9 日誌、錯誤處理與測試方式

- 日誌：僅 Alembic 於 `alembic.ini` 設定 logger（`root`=WARN、`alembic`=INFO）與 Uvicorn 預設日誌；**後端應用程式無自訂 logging 設定**。
- 錯誤處理：以 `HTTPException` 明確定義狀態碼與 detail；DB 唯一鍵衝突統一轉 409。
- 測試方式：
  - 後端：`pytest` + `fastapi.testclient`，於記憶體 SQLite（`StaticPool`）建立 schema，並以 FakeRedis monkeypatch 取代 Redis。
  - 前端：`vitest` + Testing Library，以 `fetch` mock 模擬 API。
- ❌ 無監控（metrics／APM）、無備份、無資料加密（密碼除外）、無集中式稽核、無高可用設定。

---

## 11. 驗收標準

> 「測試涵蓋」欄以現有自動化測試為準；標「否」者代表**尚未有自動化測試**，需人工依步驟驗證。

| #   | 驗收條件                    | 前置條件                                 | 操作步驟                                                        | 預期結果                                                       | 測試涵蓋                            |
| --- | --------------------------- | ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| A1  | 正確登入                    | 存在啟用中帳號                           | 以正確帳密呼叫 `POST /auth/login`                               | 200，回 `access_token`、`token_type=bearer`                    | 是（`test_jwt_rbac.py`）            |
| A2  | 錯誤登入被拒                | 同上                                     | 以錯誤密碼呼叫登入                                              | 401 `Invalid username or password`                             | 是                                  |
| A3  | 停用帳號無法登入            | 存在 `is_active=false` 帳號              | 以正確密碼登入                                                  | 401                                                            | 是                                  |
| A4  | 未帶／無效／過期 Token 被拒 | —                                        | 呼叫 `GET /auth/me`                                             | 401                                                            | 是                                  |
| A5  | 登出後 Token 失效           | 已登入                                   | 登出後再呼叫 `GET /auth/me`                                     | 401，且 Redis 有撤銷鍵                                         | 是                                  |
| A6  | 無權限使用者被拒            | 具 read 權限角色                         | 以該帳號 `POST /suppliers`                                      | 403                                                            | 是（`test_catalog_api.py`）         |
| A7  | `seed:` 權限正規化          | 角色權限為 `seed:suppliers:read`         | `GET /auth/me` 後存取 `GET /suppliers`                          | `/me` 權限顯示 `suppliers:read`；存取 200                      | 是（`test_jwt_rbac.py`）            |
| A8  | 管理員依實際權限存取        | `seed_admin` 具全部權限                  | 呼叫各受保護端點                                                | 皆 200／201（依實際授權）                                      | 否（僅 Seeder 授權定義）            |
| A9  | 供應商基本操作              | 具 `suppliers:write`                     | 建立→查詢→更新→關鍵字搜尋分頁                                   | 201／200；重複代碼 409；不存在 404                             | 是                                  |
| A10 | 供應商資格文件查詢          | 存在文件資料                             | `GET /suppliers/{id}/documents`                                 | 200 清單                                                       | 是                                  |
| A11 | 物料基本操作                | 具 `materials:write`                     | 建立→查詢→更新→搜尋分頁                                         | 201／200；重複代碼 409；不存在 404                             | 是                                  |
| A12 | 供貨關聯與首選              | 具 `suppliers:write`                     | 建立關聯（`is_preferred=true`）→ 查物料供應商 → 刪除            | 201／200／204；重複 409；同物料僅 1 筆首選                     | 是                                  |
| A13 | 收料建立與查詢              | 已存在供應商、物料、供應商批次與供貨關聯 | `POST /receipts` → `GET /receipts`／`{id}`                      | 201，`qty_remaining=qty_received`；清單可見                    | 是（建立）；404 分支否              |
| A14 | 收料一致性限制              | 存在不符合之供應商／物料／批次           | 送出不符的 `supplier_lot_id`                                    | 400                                                            | 否                                  |
| A15 | 供貨關聯缺失                | 供應商未與物料建立關聯                   | 送出收料                                                        | 400「Supplier is not linked to the material」                  | 否                                  |
| A16 | 批次拆分數量限制            | 存在收料且有剩餘量                       | 拆分量 > `qty_remaining`；或重複 `internal_lot_no`；或 `qty<=0` | 400／409／400                                                  | 部分（成功案例是；超量／重複否）    |
| A17 | IQC 建立                    | 存在內部批次                             | `POST /iqc`（passed/released）                                  | 201，`inspector_user_id` 為登入者，批次 `lot_status=available` | 是                                  |
| A18 | IQC 查詢與更新              | 存在 IQC 記錄                            | `GET /iqc`、`GET /iqc/{id}`、`PATCH /iqc/{id}`                  | 200；更新後結果／狀態變更                                      | 是（更新是；`GET /iqc/{id}` 否）    |
| A19 | IQC 結果與放行配對          | —                                        | 送出 `passed` + `hold` 等不符組合                               | 422（Schema）或 400                                            | 是（Schema 層）                     |
| A20 | 不存在的資料處理            | —                                        | 以不存在 ID 呼叫各明細端點                                      | 404                                                            | 是（供應商／物料）；其餘部分否      |
| A21 | 重複資料處理                | —                                        | 重複代碼／單號／批號                                            | 409                                                            | 部分                                |
| A22 | DB 異常行為                 | MySQL 不可用                             | 呼叫受保護端點／`health/database`                               | 端點可能 5xx；健康檢查回 `unavailable`                         | 否（未在無 DB 環境驗證）            |
| A23 | Redis 異常行為              | Redis 不可用                             | 呼叫受保護端點                                                  | 503 `Authentication service unavailable`（不放行）             | 否                                  |
| A24 | 健康檢查端點可用            | 服務啟動                                 | 呼叫 `/api/v1/health`、`/live`、`/ready`、`/database`、`/redis` | 200 且含 `status`                                              | 是（僅斷言鍵存在）                  |
| A25 | 前端建置                    | 已安裝依賴                               | `npm run build`                                                 | 建置成功                                                       | 否（本次未執行；README 曾記錄成功） |
| A26 | 前端主要頁面操作            | 已安裝依賴                               | 登入→收料建立→拆分→IQC                                          | 流程完成並顯示後端確認狀態                                     | 是（`App.test.tsx`，以 mock API）   |

### 11.1 本次實際執行之測試

| 項目     | 命令                                          | 結果                                                              |
| -------- | --------------------------------------------- | ----------------------------------------------------------------- |
| 後端測試 | `uv run pytest -q`（於 `backend/`）           | **17 passed**，exit code 0（僅 1 筆 StarletteDeprecationWarning） |
| 前端測試 | `npm test`（於 `frontend/`，即 `vitest run`） | **2 passed**（1 個測試檔），exit code 0                           |

> 上述測試皆使用記憶體 SQLite 與假 Redis／mock fetch，**未**在真實 MySQL／Redis 或 Docker Compose 環境執行；未執行 `npm run build`。

---

## 12. 已知限制與後續待辦

> 僅列出有程式碼證據支持之項目。

### 12.1 已知缺陷（有程式碼證據）

| #   | 項目                            | 說明                                                                           | 依據                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| D1  | ID 配置競態                     | 主鍵非 AUTO_INCREMENT，以 `max(id)+1` 配置，併發下可能撞號（`IntegrityError`） | `materials.py`、`suppliers.py`、`quality.py` 的 `_next_id` |
| D2  | IQC 建立非原子交易              | 先 commit 記錄、再 commit 批次狀態，第二段失敗會留下不一致                     | `quality.py::create_iqc_record`                            |
| D3  | 單一請求內重複批號未前置攔截    | 前置檢查逐筆查 DB，未比對同請求內重複；可能於 flush 拋未處理 `IntegrityError`  | `quality.py::split_receipt_into_internal_lots`             |
| D4  | IQC 更新未驗證新關聯一致性      | `PATCH /iqc/{id}` 改 `receipt_id`／`internal_lot_id` 時不比對歸屬與物料        | `quality.py::update_iqc_record`                            |
| D5  | Nginx `/health/` 尾斜線         | 代理至 `/api/v1/health/`，後端無此路由，依賴 FastAPI 重導                      | `docker/nginx/default.conf`                                |
| D6  | README 連接埠不一致             | README 記 Nginx 80，實際對外為 8087                                            | `README.md` vs `docker-compose.yml`                        |
| D7  | 前端 Dockerfile 為開發模式      | `CMD` 執行 `npm run dev`，非正式建置產物                                       | `frontend/Dockerfile`                                      |
| D8  | 殘留 `app/services/__pycache__` | 存在 `auth_service.cpython-313.pyc`，但目錄下無對應 `.py` 原始檔               | 檔案系統（僅快取檔）                                       |

### 12.2 功能尚未實作

- ❌ 供應商批次（`supplier_lots`）建立／更新 API（追溯鏈上游斷點）。
- ❌ 供應商刪除、物料刪除、收料更新／刪除、內部批次更新／刪除、IQC 刪除。
- ❌ 使用者管理、角色管理、權限管理 API（`users:manage` 權限無端點）。
- ❌ 供應商資格文件建立／更新／刪除與檔案上傳／下載。
- ❌ 不合格品處理、退貨、讓步接收、隔離單等品保流程。
- ❌ 專用追溯查詢 API（由物料／批次反查完整履歷）。
- ❌ 稽核軌跡（audit log）與異動歷程。
- ❌ 監控、備份、加密（密碼以外）、集中稽核、高可用。

### 12.3 尚未驗證（已實作但缺證據）

- ⚠️ `supplier_lots.qc_status`、`material_receipts.status` 之上游／後續狀態流轉（無更新機制）。
- ⚠️ DB／Redis 不可用時的實際行為（A22、A23）。
- ⚠️ 收料一致性檢查（A14、A15）與多筆拆分（超量／重複批號）之錯誤處理。
- ⚠️ 前端 `npm run build` 於當前工作區之結果。
- ⚠️ `/health/ready` 於真實 MySQL／Redis 下的 `ready`／`degraded` 判定。

### 12.4 未來可能擴充（僅陳述方向，非承諾）

- 供應商批次建立介面與主檔維護完整化。
- 收料／IQC 單一交易化與更嚴謹的併發安全 ID 配置。
- 不合格品與隔離／退貨／讓步接收流程。
- 追溯履歷查詢與稽核軌跡。

---

## 附錄：本次檢查範圍

- 後端程式碼：`backend/app/**`（main、api/routes/{auth,health,suppliers,materials,quality}、core/{config,security,redis_client}、db/{base,session}、models/{user,quality}、schemas/{auth,catalog}）。
- 遷移：`backend/alembic/versions/20261019_create_user_auth_tables.py`、`20261019_add_mysql_comments_first_schema.py`、`alembic/env.py`、`alembic.ini`。
- Seeder／工具：`backend/scripts/seed_dev.py`、`backend/check_mysql_comments.py`、`backend/docker-entrypoint.py`。
- 測試：`backend/tests/{test_smoke,test_infrastructure,test_jwt_rbac,test_catalog_api,test_quality_workflow_api}.py`；`frontend/src/App.test.tsx`。
- 前端：`frontend/src/**`（App、api/client、components/{AppLayout,ui}、lib/{data,status}、pages/{LoginPage,DashboardPage,CatalogPages,WorkflowPages}、types）與 `package.json`、`vite.config.ts`、`Dockerfile`。
- 部署：`docker-compose.yml`、`docker/nginx/default.conf`、`backend/Dockerfile`、`backend/.env.example`、根目錄 `README.md`、`backend/README.md`。