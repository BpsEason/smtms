# SMTMS AI Coding 專案指令

## 核心工作流程
1. **任務開始時**：先確認需求範圍，識別相關模組，只讀取必要的檔案
2. **依賴擴展原則**：沿著實際依賴鏈逐步擴大搜尋範圍，禁止無故掃描整個 Repository
3. **沿用既有模式**：優先使用現有的架構、命名慣例、資料存取與錯誤處理模式
4. **禁止假設存在**：不得假設不存在的欄位、API、權限或資料表，必須查證後才能使用
5. **最小修改原則**：只修改完成任務所必要的檔案，不為小型需求新增Service、Repository、DTO、Helper或抽象層
6. **修改後驗證**：執行與變更直接相關的測試，確保修改不會導致回歸
7. **文件以實作為準**：遇到文件與實作不一致時，以查證的程式碼結果為準，不可猜測
8. **任務完成回報**：簡短回報修改的檔案、驗證結果及未解決問題

## 新功能開發流程
- 先找最相似的既有功能，遵循其已驗證的實作方式（優先參考 CatalogPages 與 access.py）
- 先確認 API 契約、資料型別、權限、資料流及測試，再開始修改
- 不為了追求一致性而增加不必要的抽象、元件、輔助函數或依賴套件
- 同類功能優先採用相同模式；若必須不同，說明原因

## 前端強制規範

### 資料獲取
- 所有列表頁與需要遠端資料的頁面，**必須**使用 TanStack Query
- 禁止再使用手動的 `useState` + `useEffect` + `Promise.all` 來管理遠端資料（RolesPermissionsPage 這類舊寫法應逐步淘汰）
- Query Key 必須包含所有會影響結果的參數
- 搜尋輸入必須做防抖（建議 250ms），並將防抖後的值放入 Query Key

### 表單處理
- 複雜表單、多欄位驗證、需要一致錯誤處理的表單，**必須**使用 React Hook Form + Zod
- 簡單表單可保留精簡實作，但必須有明確的驗證與錯誤處理方式
- 禁止主要依賴手動 FormData 或直接操作 DOM 來做驗證

### 類型定義
- 核心業務類型一律從全域 `types.ts`（或 `@/types`）匯入
- 禁止在各頁面重複定義 Role、Permission、User、Material、Supplier 等核心類型
- 只有頁面專屬的 UI 狀態類型，才允許建立本地 `types.ts`

### API 呼叫
- 一律使用既有統一 API client
- 錯誤處理統一走既有的 `getErrorMessage` / `message` 機制，不自行建立另一套

## 後端模式選擇
- 延續現有 FastAPI Router、Pydantic Schema、SQLAlchemy Model 與 Service 的實際分工，不為每個 CRUD 強制新增 Service
- 依照資料一致性與併發風險決定是否使用交易、鎖定或其他併發控制（參考 access.py 的 advisory lock 寫法）
- 延續現有權限依賴注入、錯誤回應與分頁契約
- 資源查詢輔助函數優先使用 `_get_{resource}_or_404` 命名風格
- 不為了函數命名一致而批次修改既有程式碼

## 後端 Async/Sync 規範
- **Redis 操作**：必須使用 `redis.asyncio` 客戶端，所有 Redis 操作都需要 `await`
  ```python
  # 正確範例
  redis = get_redis_client()
  await redis.get("key")
  await redis.set("key", "value", ex=3600)
  ```
- **SQLAlchemy Session**：使用同步 Session，依賴注入 `get_db()`，不要在同步函數中執行 async 操作
- **混合使用注意事項**：
  - 同步 API 路由（使用 `def`）：不能直接呼叫 async 函數，若需要 Redis 操作，需將路由改為 `async def`
  - 非同步 API 路由（使用 `async def`）：Session 仍使用同步依賴注入，FastAPI 會正確處理
  - 禁止使用 `asyncio.run()` 包裝 async 呼叫來解決同步函數中的非同步操作，應改為將路由宣告為 async
  - 永遠不要遺漏 `await` 關鍵字，否則會導致 Redis 操作永遠不會執行

## SQLAlchemy Session 與交易規範
- **Session 管理**：永遠使用依賴注入 `db: Session = Depends(get_db())`，不要自行建立 SessionLocal 或管理連線
- **交易邊界**：
  - 單一資料庫操作：FastAPI 依賴注入自動管理 Session 生命週期，呼叫 `db.commit()` 確認變更
  - 複雜操作需要原子性：使用 `with db.begin():` 明確界定交易範圍
  - 錯誤處理：發生例外時，依賴注入會自動 rollback，不需手動處理
- **禁止行為**：
  - 不要自行建立新的 Session 實例
  - 不要使用巢狀交易
  - 不要重複呼叫 db.commit() 或手動管理連線生命週期
  - 不要跨請求重用 Session 實例

## 認證、權限與資料歸屬規範
- **認證機制**：沿用既有 JWT + Redis Token 撤銷機制，不要實作另一套認證流程
- **權限檢查**：使用現有的依賴注入：
  - `require_permission("permission.code")`：檢查使用者是否擁有特定權限
  - `require_role("admin")`：檢查使用者是否擁有特定角色
  - `get_current_user()`：取得目前認證的使用者資訊
- **資料歸屬驗證**：
  - 供應商帳號必須呼叫 `ensure_supplier_access(current_user, supplier_id)` 確認只能存取自己供應商的資料
  - 所有資源存取都必須驗證當前使用者有權限存取該資源，避免垂直權限提升
- **禁止行為**：不要自行新增另一套 RBAC 或存取控制抽象層，所有新 API 都必須沿用現有權限框架

## 供應商資料隔離強制規範
新增或修改涉及供應商資源的 API 時，**必須**遵循以下規範：

### 1. 基礎存取控制要求
- 單筆查詢、更新、刪除操作：必須驗證資源歸屬，使用 `ensure_supplier_access(current_user, supplier_id)` 或等效的資料庫層過濾
- 列表、搜尋、分頁查詢：**必須**在資料庫查詢層限制可存取範圍，禁止先取得全部資料再於記憶體過濾
- 不得只依據前端傳入的 `supplier_id` 或資源 ID 判定使用者有權存取，必須透過 `current_user.supplier_id` 驗證

### 2. 關聯資料建立驗證
建立關聯資料時，必須驗證相關資源之間的供應商歸屬是否一致：
- 當建立涉及多個資源的關聯時（如供應商批次、收料紀錄、IQC 記錄等），必須確保所有關聯資源都屬於同一個供應商
- 範例：建立收料紀錄時，驗證所關聯的供應商批次確實屬於指定的供應商
- 範例：建立不良品記錄時，驗證所有關聯的收料、批次、IQC 記錄的供應商 ID 一致

### 3. 巢狀資源與特殊操作
- 巢狀資源（如 `/suppliers/{supplier_id}/materials`）：父資源必須先呼叫 `ensure_supplier_access` 驗證存取權限
- 批次操作：每筆受影響的資源都必須獨立驗證供應商歸屬，或在查詢層過濾僅限目前使用者的供應商
- 關聯查詢：必須連帶過濾所有關聯資源的供應商歸屬，避免跨供應商關聯洩漏
- 檔案下載：下載前必須驗證檔案所屬的資源歸屬於目前使用者的供應商

### 4. 現有實作模式參考
- **suppliers.py**：所有以 `/{supplier_id}/` 開頭的巢狀資源都在進入點呼叫 `ensure_supplier_access`
- **materials.py**：供應商使用者只能存取與自己有關聯的材料，列表查詢透過 `in_(supplier_material_ids)` 過濾
- **quality.py**：複雜關聯資源透過 `_ensure_internal_lot_supplier_access` 追蹤整個追溯鏈的供應商歸屬
- **nonconformances.py**：`_validate_links` 函數驗證所有關聯資源的供應商一致性，避免跨供應商關聯

### 5. 測試要求
依照修改範圍補充或執行跨供應商存取測試，至少驗證：
- 供應商使用者無法存取其他供應商的資源（返回 403）
- 內部使用者可以存取所有供應商的資源
- 無法建立跨供應商的關聯資料（返回 400 或 403）
- 列表查詢僅返回目前供應商有權存取的資料

## API 與前端契約規範
- **後端 Schema**：使用 Pydantic v2 定義請求與回應 Schema，保持與既有 API 一致的命名風格
- **API 回應格式**：沿用既有統一錯誤回應格式，HTTP 狀態碼遵循標準 REST 慣例
- **前端 API 呼叫**：
  - 列表頁面使用 TanStack Query 管理遠端資料
  - 表單使用 React Hook Form + Zod 進行驗證
  - 所有 API 呼叫使用統一的 API client，錯誤處理通過 `getErrorMessage()` 統一處理
- **型別一致性**：新增或修改欄位時，必須同步更新：
  - 後端 Pydantic Schema
  - 前端 TypeScript 類型定義（@/types）
  - 前端 Zod 驗證 schema
  - 確保前後端欄位名稱、型別完全一致

## 問題排查流程
1. 重現問題並確認預期結果與實際結果
2. 追蹤前端操作、API 請求、後端處理、資料庫及回應的完整資料流
3. 檢查相關程式碼、設定、API 契約、Schema、資料表與測試
4. 根據證據確認根因；若仍不確定，先回報調查結果與待確認事項
5. 採用最小修改修正根因，評估相鄰功能與回歸風險
6. 先執行針對性測試，再執行適用的完整檢查
7. 回報根因、修改檔案、測試命令、實際結果及剩餘風險

### 表單送出失敗時的標準定位路徑
1. 前端狀態：欄位值是否正確？Zod 驗證是否擋住提交？
2. Payload：實際送出的資料是否符合預期？（注意空字串、undefined、型別轉換）
3. HTTP 層：請求有沒有真的發出？狀態碼與回應內容是什麼？
4. 後端驗證：Pydantic、權限、業務規則是否拒絕？
5. 資料庫：是否發生唯一約束、外鍵或交易問題？

## AI Agent 執行限制
- 不臆測不存在的欄位、API、權限或業務規則
- 不在未確認根因時進行大範圍修改
- 不因單一功能需要就重構整個模組
- 不宣稱執行過未實際執行的測試
- 文件保持精簡，避免與既有規範重複

## Token 優化策略
1. **先讀取規格**：每次任務先讀取本專案指令與任務直接相關的規格文件
2. **模組優先搜尋**：先以SearchCodebase搜尋相關模組，再讀取必要的相依檔案
3. **避免重複讀取**：不重複讀取已取得且未變更的相同內容
4. **長輸出裁剪**：測試或命令輸出過長時，只擷取與問題相關的錯誤、呼叫堆疊及結果摘要
5. **保留必要驗證**：不得為了省Token而省略必要的業務驗證、權限檢查或測試

## 必須先查證的核心關聯
- 供應商(suppliers) → 供應商批次(supplier_lots) → 收料紀錄(material_receipts) → 內部批次(internal_material_lots) → IQC記錄(iqc_records)
- 產品序號追溯鏈必須符合現有資料關聯，不得破壞追溯性
- JWT、RBAC權限系統與Audit Log的實作必須遵循現有架構
- 環境依賴：外部MySQL、Redis，Docker僅包含Redis、後端、前端及Nginx

## TanStack Query (React Query) 使用規範
前端列表頁面使用TanStack Query管理資料獲取時，必須遵循以下規範：

### 1. Query Key 設計原則
- Query Key必須包含所有影響API返回結果的參數：搜尋關鍵字、篩選條件、分頁頁碼、日期範圍等
- 範例：`['receipts', debouncedQuery, debouncedStatus, debouncedDateFrom, debouncedDateTo, debouncedPage]`
- 每當任何參數變化時，TanStack Query會自動觸發重新請求，不需要手動調用refetch

### 2. 輸入防抖(Debounce)處理
- 僅對用戶連續輸入的搜尋框使用250ms防抖
- 將防抖應用於狀態更新，而非直接調用refetch：創建debounced狀態，將其放入Query Key
- 避免在useEffect中手動調用refetch，這會導致重複請求

### 3. 快取設定標準
- `staleTime: 30 * 1000`（30秒）：列表資料30秒內不重複請求，平衡即時性與效能
- `retry: 1`：API請求失敗僅重試一次，避免無限重試
- 快取失效處理：建立/更新/刪除資料後，通過`await refetch()`手動觸發重新獲取，此時會保留當前所有篩選條件

### 4. 錯誤處理
- 統一使用Query返回的`queryError`，避免與本地setError產生覆蓋或衝突
- 手動重試按鈕只調用一次`refetch()`，不會重複觸發不必要請求
- 錯誤訊息通過`getErrorMessage()`統一處理，保持錯誤顯示一致性

### 5. 常見錯誤避免
- ❌ 禁止同時依賴Query Key自動刷新和useEffect手動refetch，會導致重複API請求
- ❌ 禁止將未防抖的用戶輸入直接放入Query Key，會造成頻繁請求
- ✅ 正確模式：用戶輸入→防抖更新debounced狀態→Query Key變化→自動重新請求