---
title: SMTMS AI Agent 開發 Skill
version: 1.0.0
last_updated: 2026-11-04
---

# SMTMS AI Agent 開發 Skill

## 1. Skill 使用時機

當您在 SMTMS（供應商物料追溯管理系統）專案中執行任何開發任務時，請先完整閱讀並遵守本 Skill 中的所有規範。

## 2. 核心開發原則

### Think Before Code

- 先分析需求、資料流及依賴關係，再開始修改
- 確認需求範圍，識別相關模組，只讀取必要的檔案
- 沿著實際依賴鏈逐步擴大搜尋範圍，禁止無故掃描整個 Repository

### KISS / Minimal Diff

- 只修改必要檔案，不為小型需求新增不必要的抽象層
- 不為了程式碼整齊而重構無關模組
- 不增加不必要的套件
- 優先使用現有的架構、命名慣例、資料存取與錯誤處理模式

### No Guessing

- 不得假設不存在的欄位、API、權限或資料表，必須查證後才能使用
- 遇到文件與實作不一致時，以查證的程式碼結果為準，不可猜測

### Low Context / Low Coupling

- 只讀取任務相關檔案，避免重複讀取相同文件
- 不輸出大量無關程式碼，優先使用精簡的調查結果

### Root Cause First

- 遇到 Bug 時，先確認實際執行流程、問題發生位置、根本原因、影響範圍
- 確認最小修正方案後，再進行修改

### 2.1 精簡分析與輸出規範（Concise Reasoning & Output）

- **不需要輸出完整思考過程**：不要求展示逐步推理、內部思考、自我對話或冗長的分析過程。
- **只輸出必要的分析摘要**：說明問題根因、影響範圍、修正方案及必要的技術決策。
- **先結論，後依據**：優先說明判斷結果，再列出必要的程式碼、檔案或測試依據。
- **避免重複資訊**：不重複描述已讀取的文件、已確認的規範或相同的分析結果。
- **精簡執行回報**：只列出實際修改的檔案、修改內容及測試結果，不輸出大量無關的執行日誌。
- **保留必要細節**：涉及資料一致性、權限、安全性、交易及併發風險時，仍須提供足以驗證決策的技術依據，不得為了精簡而省略必要分析。
- **禁止虛構驗證結果**：未執行的測試不得宣稱通過，未確認的事項必須明確標示。

**標準回報格式：**

1. **分析結果**：問題根因與影響範圍。
2. **修改內容**：修改檔案及具體變更。
3. **驗證結果**：執行的測試及通過／失敗數量。
4. **待處理事項**：尚未解決的問題（若無則省略）。

## 3. 技術架構摘要

### 前端技術堆疊

- React 19、TypeScript、Vite 8、React Router 7、Tailwind CSS 4
- 主要套件：@tanstack/react-query 5.105.0、react-hook-form 7.91.0、zod 4.6.7

### 後端技術堆疊

- Python 3.12+、FastAPI、Pydantic 2、SQLAlchemy 2、Alembic、Uvicorn
- 主要套件：redis 5.0.0、PyJWT 2.8.0、bcrypt 4.1.2

### 基礎設施

- 資料庫：MySQL 8（外部）、Redis 7（用於JWT撤銷）
- 部署：Docker Compose（Redis、後端、前端、Nginx）

## 4. 前端開發規範

### 資料獲取規範

- 所有列表頁與需要遠端資料的頁面，**必須**使用 TanStack Query
- 禁止使用手動的 `useState` + `useEffect` + `Promise.all` 來管理遠端資料
- Query Key 必須包含所有會影響結果的參數
- 搜尋輸入必須做防抖（建議 250ms），並將防抖後的值放入 Query Key

### 表單處理規範

- 複雜表單、多欄位驗證、需要一致錯誤處理的表單，**必須**使用 React Hook Form + Zod
- 簡單表單可保留精簡實作，但必須有明確的驗證與錯誤處理方式
- 禁止主要依賴手動 FormData 或直接操作 DOM 來做驗證

### 類型定義規範

- 核心業務類型一律從全域 `types.ts`（或 `@/types`）匯入
- 禁止在各頁面重複定義 Role、Permission、User、Material、Supplier 等核心類型
- 只有頁面專屬的 UI 狀態類型，才允許建立本地 `types.ts`

### API 呼叫規範

- 一律使用既有統一 API client（`src/api/client.ts`）
- 錯誤處理統一走既有的 `getErrorMessage` / `message` 機制，不自行建立另一套

## 5. 後端開發規範

### 架構模式

- 延續現有 FastAPI Router、Pydantic Schema、SQLAlchemy Model 與 Service 的分工
- 依照資料一致性與併發風險決定是否使用交易、鎖定或其他併發控制（參考 access.py 的 advisory lock 寫法）
- 資源查詢輔助函數優先使用 `_get_{resource}_or_404` 命名風格

### Async/Sync 規範

- **Redis 操作**：必須使用 `redis.asyncio` 客戶端，所有 Redis 操作都需要 `await`
- **SQLAlchemy Session**：使用同步 Session，依賴注入 `get_db()`，不要在同步函數中執行 async 操作
- 同步 API 路由（使用 `def`）：不能直接呼叫 async 函數，若需要 Redis 操作，需將路由改為 `async def`

### Session 與交易規範

- **Session 管理**：永遠使用依賴注入 `db: Session = Depends(get_db())`，不要自行建立 SessionLocal 或管理連線
- **交易邊界**：
  - 單一資料庫操作：FastAPI 依賴注入自動管理 Session 生命週期，呼叫 `db.commit()` 確認變更
  - 複雜操作需要原子性：使用 `with db.begin():` 明確界定交易範圍
  - 錯誤處理：發生例外時，依賴注入會自動 rollback，不需手動處理

## 6. 供應商資料隔離

新增或修改涉及供應商資源的 API 時，**必須**遵循以下規範：

### 1. 基礎存取控制要求

- 單筆查詢、更新、刪除操作：必須驗證資源歸屬，使用 `ensure_supplier_access(current_user, supplier_id)` 或等效的資料庫層過濾
- 列表、搜尋、分頁查詢：**必須**在資料庫查詢層限制可存取範圍，禁止先取得全部資料再於記憶體過濾
- 不得只依據前端傳入的 `supplier_id` 或資源 ID 判定使用者有權存取，必須透過 `current_user.supplier_id` 驗證

### 2. 關聯資料建立驗證

建立關聯資料時，必須驗證相關資源之間的供應商歸屬是否一致：

- 當建立涉及多個資源的關聯時（如供應商批次、收料紀錄、IQC 記錄等），必須確保所有關聯資源都屬於同一個供應商
- 範例：建立收料紀錄時，驗證所關聯的供應商批次確實屬於指定的供應商

## 7. 業務規則與追溯鏈

核心追溯鏈必須維持完整性：

```
供應商 → 供應商批次 → 收料紀錄 → 內部批次 → IQC 記錄
```

所有業務規則的詳細定義與實作狀態請參考：[business_rules.md](business_rules.md)

## 8. 交易及資料一致性

- 涉及多步驟的資料修改必須使用交易確保原子性
- 重要的 ORM 異動必須記錄到稽核軌跡中
- 關聯資料的刪除必須檢查依賴關係，避免孤兒資料（系統技術規範：供應商批次若有關聯記錄，禁止刪除）

## 9. 測試與驗證

- 任務完成後必須執行相關測試：`uv run pytest tests/test_xxx.py`
- 檢查程式碼風格：`uv run ruff check .`
- 檢查型別正確性：`uv run mypy app/`
- 前端測試：`cd frontend && pnpm test -- --run`

## 10. AI Agent 執行限制

- 不得修改業務程式碼、資料庫結構除非任務明確要求
- 不得安裝新的依賴套件
- 不得為了省Token省略必要的測試和驗證步驟
- 不得假設不存在的功能或欄位，必須查證後再使用
- 本任務只建立與整理 Skill，不得修改 SMTMS 業務程式碼、資料庫 Schema 或既有測試

## 10. 必須遵守的寫法範例

### 後端程式碼範例

#### 1. ensure_supplier_access 標準用法

```python
from app.core.security import AuthenticatedUser, ensure_supplier_access, require_permission

@router.get("/{supplier_id}/resources", response_model=List[ResourceResponse])
def list_supplier_resources(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("resources:read")),
):
    # 所有巢狀資源進入點必須先驗證存取權限
    ensure_supplier_access(current_user, supplier_id)
    # 繼續處理業務邏輯...
```

#### 2. with db.begin() 原子操作範例

```python
def complex_atomic_operation(
    db: Session,
    supplier_id: int,
    payload: OperationPayload,
):
    # 複雜多步驟操作必須使用交易確保原子性
    with db.begin():
        # 步驟1：更新A表
        entity_a = db.get(EntityA, a_id)
        entity_a.status = "processed"

        # 步驟2：建立B表記錄
        entity_b = EntityB(**payload.model_dump())
        db.add(entity_b)

        # 步驟3：更新C表統計
        entity_c = db.get(EntityC, c_id)
        entity_c.total += payload.quantity
    # 離開with區塊自動commit，發生例外自動rollback
```

### 前端程式碼範例

#### TanStack Query + debounced Query Key 標準寫法

```typescript
// 使用useState保存原始輸入
const [query, setQuery] = useState("");
const [status, setStatus] = useState("");
const [page, setPage] = useState(1);

// 250ms防抖處理
const debouncedQuery = useDebounce(query, 250);
const debouncedStatus = useDebounce(status, 250);

// Query Key必須包含所有影響結果的參數
const { data, isLoading, error } = useQuery({
  queryKey: ["resources", debouncedQuery, debouncedStatus, page],
  queryFn: () =>
    api.resources.list({
      query: debouncedQuery,
      status: debouncedStatus,
      page,
      page_size: 20,
    }),
  staleTime: 30 * 1000, // 30秒內不重複請求
  retry: 1, // 失敗僅重試一次
});

// 表單提交後手動刷新
const handleSubmit = async () => {
  await createResource(data);
  await refetch(); // 保留所有篩選條件重新獲取
};
```

## 11. Layout 修改規範

- **優先使用 ProLayout 原生功能**：不得為了客製化選單而重建整套側邊欄。
- **UI/UX 一致性**：自訂 `menuItemRender` / `subMenuItemRender` 時，必須保留原生選單狀態與視覺；不得只為了讓測試通過而犧牲 UI 行為。
- **狀態同步**：路由、選中狀態與 React Router 必須保持同步。使用 `useLocation` 同步 `pathname`。
- **Header 管理**：修改 Header 時必須保留使用者資訊及登出功能，使用 ProLayout 支援的 Header 擴充 API，不得因自訂內容而使原生 Header 消失。
- **驗證項目**：修改後必須驗證：
  - 選單切換與選中狀態同步。
  - 權限過濾（確認無權限項目不顯示）。
  - Header 使用者資訊顯示。
  - 登出功能正常運作。

## 12. 參考文件索引

- [技術架構詳細](architecture.md)
- [業務規則詳細](business_rules.md)
- [專案狀態詳細](project_state.md)
- [任務模板](task_template.md)
