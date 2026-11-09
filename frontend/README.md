# SMTMS Frontend

SMTMS（Supplier Material Traceability Management System）供應商物料追溯與品質管理系統的 Web 前端。

本專案使用 React 建立 SPA，透過 REST API 與 FastAPI 後端交換資料。

前端負責畫面呈現、使用者操作及資料展示；**資料驗證、JWT 驗證、權限控管與業務規則一律由後端負責**。

前端僅依據 `/auth/me` 回傳的使用者資訊調整導覽選單與按鈕可見性，不得取代伺服器端授權機制。

---

## 技術堆疊

| 類別 | 技術 | 說明 |
|---|---|---|
| 建置工具 | Vite 8 | React SPA |
| 程式語言 | TypeScript | 明確型別，降低 API 整合風險 |
| UI 框架 | React 19 | Function Component、Hooks |
| 路由 | React Router 7 | 前端路由管理 |
| 樣式 | Tailwind CSS 4 | 共用 `inputClass`、`buttonClass`、`secondaryButtonClass` |
| 元件庫 | Ant Design | 部分共用 UI 元件使用 AntD |
| Server State | TanStack Query | 列表與遠端資料管理 |
| 表單 | React Hook Form + Zod | 多欄位表單與前端驗證 |
| 圖示 | Lucide React | 圖示呈現 |
| 測試 | Vitest + Testing Library + jsdom | 前端單元及元件測試 |
| Lint | Oxlint | 程式碼品質檢查 |

### Ant Design 使用範圍

目前 Ant Design 主要用於 `src/components/ui.tsx` 的共用元件：

- Card
- Modal
- Tag
- Alert
- Spin
- Empty
- Statistic
- Button

其他頁面依照既有架構使用共用 UI 元件及 Tailwind CSS 樣式。

### 不預設使用

以下技術不列為目前專案預設方案：

- Redux
- TanStack Table
- Recharts
- shadcn/ui（頁面層按鈕已統一改用共用按鈕樣式）

---

## 開發原則

1. **沿用既有架構**：優先使用現有技術堆疊與程式模式，避免為小型需求增加不必要的抽象層。
2. **分離狀態管理**：Server State 使用 TanStack Query；Client State 使用 `useState` 等 React Hooks。
3. **遠端資料統一管理**：列表及遠端資料必須使用 TanStack Query，禁止以手動 `useState`、`useEffect`、`Promise.all` 管理伺服器資料。
4. **表單驗證**：複雜表單使用 React Hook Form + Zod；前端驗證不能取代後端驗證。
5. **統一按鈕樣式**：主要操作使用 `buttonClass`，次要操作使用 `secondaryButtonClass`，頁面不得再直接引入 shadcn Button。
6. **統一型別管理**：共用 API 型別從全域 `types.ts` 匯入，避免重複定義。
7. **統一 API 呼叫**：所有 API 請求必須經過統一 API Client，業務 API 集中於 `src/api/`。
8. **最小修改原則**：優先沿用既有元件與邏輯，不因單一功能需求擴大重構範圍。

---

## 已實作功能

| 模組 | 功能 |
|---|---|
| 登入 | JWT Bearer、`localStorage` 暫存 Token、401 清除登入狀態、登出呼叫後端 |
| 儀表板 | 列表總筆數、近期收料、IQC 待審等作業摘要；非良率或趨勢 KPI |
| 供應商 | 列表、搜尋、分頁、建立、編輯、批次匯入、資格文件、供應物料關聯 |
| 物料 | 列表、搜尋、分頁、建立、編輯 |
| 收料 | 建立收料、收料明細、拆分內部批號；依權限建立供應商批號 |
| 內部批號 | 列表、搜尋、分頁 |
| IQC | 對內部批號建立檢驗，檢驗結果及放行依後端規則處理 |
| 品保簽核 | 待簽核清單、核准、退回、簽核歷程 |
| 品質異常 | 建立案件、篩選、調查、處置、附件、狀態流轉 |
| 全鏈路追溯 | 多種識別碼查詢、當頁 CSV 匯出 |
| 管理／稽核 | 依使用者權限顯示，視後端功能啟用狀態提供 |

### 共用 UI 元件

位置：`src/components/ui.tsx`

| 元件 | 用途 |
|---|---|
| `PageHeader` | 頁面標題、描述與操作區 |
| `Panel` | 共用內容區塊 |
| `DataTable` | 資料表格 |
| `TableHead` / `TableBody` | 表格表頭與內容 |
| `TableRow` | 表格列 |
| `Th` / `Td` | 表格欄位 |
| `StatusBadge` | 狀態標籤 |
| `FormField` | 表單欄位標籤、提示與錯誤訊息 |
| `LoadingState` | 載入狀態 |
| `EmptyState` | 空資料狀態 |
| `ErrorState` | 錯誤狀態 |
| `SuccessMessage` | 成功訊息 |
| `ConfirmDialog` | 確認操作對話框 |
| `Metric` | 統計數值 |

共用樣式：

- `inputClass`
- `buttonClass`
- `secondaryButtonClass`

---

## 目錄結構

以下為主要目錄示意，實際路徑以 Repository 為準。

```text
frontend/
├── package.json
├── vite.config.ts
├── Dockerfile
├── tests/
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── types.ts
    ├── api/
    │   ├── client.ts
    │   └── ...                 # 各業務 API 模組
    ├── components/
    │   ├── AppLayout.tsx
    │   └── ui.tsx              # 共用 UI 元件與按鈕樣式
    ├── lib/                    # error、status、data 等共用工具
    └── pages/
        ├── DashboardPage.tsx
        ├── LoginPage.tsx
        ├── suppliers/
        ├── materials/
        ├── workflow/
        ├── nonconformance/
        └── ...
```

### 主要目錄職責

| 目錄 | 職責 |
|---|---|
| `api/` | API Client、業務 API 模組及遠端資料存取 |
| `components/` | 共用版面與 UI 元件 |
| `lib/` | 錯誤處理、狀態轉換及共用工具 |
| `pages/` | 各業務模組頁面 |
| `tests/` | 前端測試 |

---

## API 統一管理規範

**核心原則：API 只從一個入口進出，頁面只使用業務 API，不直接處理 HTTP 細節。**

API 呼叫分成三個層次：

```text
Page / Component
       │
       ▼
TanStack Query
       │
       ▼
src/api/*.ts
業務 API 方法
       │
       ▼
src/api/client.ts
統一 HTTP Client
       │
       ▼
FastAPI Backend
```

### 1. API Client：統一 HTTP 入口

位置：`src/api/client.ts`

API Client 負責所有共用 HTTP 行為：

| 功能 | 責任 |
|---|---|
| Base URL | 從 `VITE_API_BASE_URL` 取得 API Origin |
| Token | 統一讀取及寫入 Token，請求自動附加 Bearer Token |
| Refresh | 使用單一 `refreshPromise` 避免併發請求重複刷新 Token |
| 401 | 優先執行 Token Refresh，成功後重試原請求；失敗才清除登入狀態並發出 `smtms:unauthorized` |
| 錯誤處理 | 統一解析 API 錯誤，使用 `ApiError` 處理 422、`detail`、`message` 等回應 |
| Query String | 使用 `buildQueryString` 統一產生查詢字串 |
| 檔案下載 | 使用 `requestBlob` 處理 Blob 回應 |
| FormData | 不強制設定 `Content-Type`，讓瀏覽器自動產生 multipart boundary |

底層提供的主要方法：

- `request<T>()`：一般 API HTTP 請求。
- `requestBlob()`：檔案或二進位資料請求。
- `buildQueryString()`：統一產生查詢參數。
- Token 相關方法：依既有實作負責 Token 讀取、儲存及清除。

**規範：**

- `request()` 與 `requestBlob()` 是底層工具，不應由業務頁面直接呼叫。
- Token Refresh、401 重試及錯誤解析只能由 API Client 統一處理。
- 不得在各頁面或業務 API 模組重複實作 Token、Refresh 或 HTTP 錯誤處理。
- `VITE_API_BASE_URL` 設定 API Origin，不包含 `/api/v1`；API 路徑依既有 Client 與後端路由契約處理。

### 2. 業務 API：統一對外介面

位置：`src/api/`

各業務 API 依照模組集中管理，例如：

- `src/api/suppliers.ts`
- `src/api/materials.ts`
- `src/api/receipts.ts`
- 其他既有業務 API 模組

業務 API 負責：

- 定義各業務功能的 API 方法。
- 組合正確的 API 路徑及 HTTP Method。
- 傳入必要的查詢參數或 Request Body。
- 明確定義參數型別及回傳型別。
- 透過統一 API Client 發送請求。

範例：

```ts
import { request, buildQueryString } from './client'
import type { Supplier } from '@/types'

interface SupplierListParams {
  page?: number
  search?: string
}

interface CreateSupplierPayload {
  name: string
}

export const api = {
  listSuppliers: (params: SupplierListParams) =>
    request<Supplier[]>(
      `/api/v1/suppliers${buildQueryString(params)}`,
    ),

  createSupplier: (body: CreateSupplierPayload) =>
    request<Supplier>('/api/v1/suppliers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
```

以上僅為結構示意，實際應依 Repository 現有的 API 模組、型別及命名方式實作，不需要為了符合範例而額外建立重複的 API 物件或改寫既有架構。

**規範：**

- 業務 API 必須集中在 `src/api/`。
- 頁面不得直接使用 `fetch()`。
- 頁面不得直接呼叫底層 `request()` 或 `requestBlob()`。
- 不得在頁面自行組合重複的 API HTTP 請求。
- 新增 API 方法時，優先沿用現有業務 API 模組。
- API 參數及回傳資料應使用明確型別，並與 `src/types.ts` 及後端契約一致。

### 3. TanStack Query：統一管理遠端資料

TanStack Query 負責：

- Server State。
- 請求載入與錯誤狀態。
- Query Cache。
- 資料重新取得及快取更新。
- Mutation 狀態。
- 新增、修改、刪除後的相關 Query 更新或失效。

列表查詢範例：

```tsx
const suppliersQuery = useQuery({
  queryKey: ['suppliers', filters],
  queryFn: () => api.listSuppliers(filters),
})
```

新增資料範例：

```tsx
const createSupplierMutation = useMutation({
  mutationFn: api.createSupplier,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ['suppliers'],
    })
  },
})
```

**規範：**

- 列表及遠端資料必須使用 TanStack Query。
- `queryKey` 必須包含會影響查詢結果的篩選條件。
- 搜尋應依需求使用防抖，並將搜尋條件納入 `queryKey`。
- 新增、修改、刪除等寫入操作使用 Mutation。
- 不得以 `useState`、`useEffect`、`Promise.all` 取代 TanStack Query 管理伺服器資料。
- 不要在頁面自行維護另一套遠端資料快取或請求狀態。

### 4. 各層責任分工

| 層級 | 負責內容 | 不應負責 |
|---|---|---|
| API Client | HTTP、Base URL、Token、Refresh、401、錯誤解析 | UI 呈現、Query Cache |
| 業務 API | 業務 API 方法、路徑、參數與回傳型別 | Token Refresh、畫面狀態 |
| TanStack Query | 請求狀態、快取、Refetch、Mutation | HTTP 底層實作 |
| Page / Component | 畫面呈現、使用者互動、Loading / Error / Empty | 直接處理 HTTP |
| `getErrorMessage` 等共用工具 | 將錯誤轉換成使用者可理解的訊息 | 重複實作 API 請求 |

### 5. Token 與登入流程

- 登入成功後，依後端回傳資料及既有 Client 實作儲存 Access Token。
- 若後端提供 Refresh Token，應一併依既有機制儲存。
- 一般 API 請求由 Client 自動附加 Bearer Token。
- Token 過期時，由 Client 統一處理 Refresh 及原請求重試。
- Refresh 失敗後，清除登入狀態並透過既有事件通知應用程式。
- 登出時依既有流程呼叫後端，並清除本機登入資訊。

不得在各業務 API 或頁面重複處理 Token。

---

## 快速開始

### 環境需求

- Node.js `^20.19.0`、`^22.12.0` 或 `>=24.0.0`
- pnpm（建議透過 Corepack 管理，版本以 `package.json` 的 `packageManager` 為準）

### 安裝依賴

```powershell
Set-Location .\frontend
corepack enable
pnpm install --frozen-lockfile
```

### 環境變數

前端僅使用：

`VITE_API_BASE_URL`

此變數應設定為 API Origin，不要包含 `/api/v1`。

未設定時，可依照 Vite Proxy 設定轉發 API 請求。

建立 `frontend/.env.local`：

```powershell
Set-Content -Path .env.local -Value 'VITE_API_BASE_URL=http://localhost:8000'
```

修改環境變數後，必須重新啟動 Vite 開發伺服器。

**禁止將密碼、JWT Secret 或其他機密資訊放入 Vite 環境變數。** 所有 `VITE_` 前綴變數都可能被打包至前端程式碼。

### 啟動開發伺服器

```powershell
pnpm run dev
```

預設網址：

`http://localhost:5173`

### 常用指令

```powershell
pnpm test -- --run       # 執行 Vitest
pnpm run lint            # 執行 Oxlint
pnpm run build           # TypeScript 檢查與 Vite Build
pnpm run preview
```

---

## 連接本機後端

### 啟動流程

1. 依照後端 README 啟動 MySQL、Redis 與 FastAPI。
2. 確認後端 API 可正常連線，例如 `http://localhost:8000`。
3. 進入 `frontend` 目錄執行 `pnpm run dev`。
4. 開啟 `http://localhost:5173`。
5. 後端 OpenAPI 文件預設為 `http://localhost:8000/docs`。

### Vite Proxy

若使用 Docker 開發環境，可依實際網路架構在 `vite.config.ts` 設定：

```ts
server: {
  host: true,
  watch: {
    usePolling: true,
    interval: 300,
  },
  // proxy: {
  //   '/api': {
  //     target: 'http://backend:8000',
  //     changeOrigin: true,
  //   },
  // },
}
```

Proxy Target 必須依實際執行環境設定：

- 本機開發：通常使用 `localhost`。
- Docker 容器：通常使用 Compose 服務名稱。

### CORS

後端 CORS 設定必須包含實際前端 Origin。

例如：

- `http://localhost:5173`
- `http://127.0.0.1:5173`

兩者屬於不同 Origin，必須分別設定。

### 登入與 API 驗證

登入後，前端使用 Bearer Token 呼叫 API。

- `401 Unauthorized`：Token 無效或登入狀態失效，依既有機制清除登入狀態。
- `403 Forbidden`：後端拒絕目前操作，應檢查使用者角色與權限設定。

不得僅修改前端按鈕可見性來解決後端 403 問題。

目前 Token 使用 `localStorage` 暫存，屬於既有實作；正式上線前應依照實際威脅模型評估 Token 儲存策略。

---

## UI 使用規範

### 按鈕樣式

所有頁面統一使用 `src/components/ui.tsx` 匯出的按鈕樣式。

| 用途 | 使用方式 |
|---|---|
| 主要操作 | `className={buttonClass}` |
| 次要操作 | `className={secondaryButtonClass}` |
| 危險操作 | `ConfirmDialog` 搭配 `destructive` |

範例：

```tsx
import {
  buttonClass,
  secondaryButtonClass,
} from '@/components/ui'

export function ExampleActions() {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={buttonClass}
      >
        儲存
      </button>

      <button
        type="button"
        className={secondaryButtonClass}
      >
        取消
      </button>
    </div>
  )
}
```

注意事項：

1. 主要操作使用 `buttonClass`。
2. 次要操作使用 `secondaryButtonClass`。
3. 刪除等危險操作應透過 `ConfirmDialog` 確認。
4. 保留原有 `type`、`disabled`、事件處理及載入狀態。
5. 不要在頁面直接引入 shadcn Button。
6. `buttonClass` 已包含 `!text-white`，避免受到 `antd/dist/reset.css` 樣式影響，造成按鈕文字顏色異常。

### 表單

- 一般輸入欄位沿用共用 `inputClass`。
- 複雜表單使用 React Hook Form + Zod。
- 欄位錯誤訊息應清楚呈現。
- 前端驗證僅提供操作回饋，最終驗證仍由後端執行。

### 共用元件

優先使用 `src/components/ui.tsx` 已有的共用元件，避免各頁面自行建立重複的標題、面板、表格、狀態標籤及訊息呈現方式。

---

## 與後端的契約

### 1. 權限

前端僅依 `/auth/me` 的資訊控制導覽及操作入口可見性。

所有寫入操作及敏感資料讀取，仍必須由後端執行權限驗證。

### 2. 資料隔離

供應商及使用者資料隔離必須由後端負責。

不得在前端過濾資料，並將其當成安全隔離機制。

### 3. 狀態流轉

以下業務狀態由後端規則決定：

- IQC 檢驗結果
- 物料放行
- 品保簽核
- 品質異常處理及結案

前端不得自行繞過後端規則變更狀態。

### 4. 全鏈路追溯

追溯資料由 API 回傳，主要關聯流程：

```text
供應商
  ↓
供應商批號
  ↓
收料
  ↓
內部批號
  ↓
IQC
  ↓
品保簽核／品質異常
```

前端負責呈現後端提供的追溯關聯，不自行推測或補造追溯資料。

### 5. 錯誤處理

API 錯誤統一經由：

- API Client
- 共用錯誤訊息工具
- 頁面共用錯誤元件

進行處理及呈現。

避免各頁面重複實作不同的錯誤解析方式。

---

## 常見問題

| 狀況 | 處理方式 |
|---|---|
| 找不到 pnpm script | 確認目前位於 `frontend` 目錄，並已透過 Corepack 啟用 pnpm |
| 無法連線 API | 檢查後端埠號、`VITE_API_BASE_URL` 與 Vite Proxy |
| CORS 錯誤 | 確認後端 `CORS_ORIGINS` 包含目前前端 Origin |
| 登入後被導回登入頁 | 檢查 Token、`/auth/me` 回應及後端 Redis 狀態 |
| API 回傳 403 | 檢查後端使用者角色與權限，不要只修改前端按鈕 |
| 按鈕文字顏色異常 | 使用 `buttonClass`，不要使用舊 shadcn Button |
| Docker 修改檔案沒有熱更新 | 確認 Vite `watch.usePolling` 設定 |
| 修改 `.env.local` 沒有效果 | 確認檔案位置及變數名稱，並重新啟動 Vite |
| 收料時沒有供應商批號可選 | 確認後端已有對應批號，或使用者具備建立批號的權限 |

---

## Docker 部署

### 開發環境

開發用 Docker Compose 可掛載前端原始碼並啟動 Vite 開發伺服器。

建議依照實際環境設定：

- Vite `host: true`
- 檔案監控 `usePolling: true`
- 正確的 API Proxy Target

### 正式環境

正式部署建議使用靜態檔案方式：

1. 執行 `pnpm run build`。
2. 產生前端靜態檔案至 `dist/`。
3. 使用 Nginx 或其他 Web Server 提供靜態檔案。
4. 設定正確的 API Origin。
5. 確認 SPA 路由回退設定正確。

本機 Docker Compose 主要供開發與演示使用，不應直接視為正式環境部署配置。

---

## 開發與維護注意事項

1. 修改前先確認現有程式碼、API 契約及資料型別。
2. 優先沿用既有 API、共用元件與程式模式。
3. 不要在前端重複實作後端已有的業務規則。
4. 不要為小型功能需求增加不必要的抽象層。
5. 修改完成後，依影響範圍執行測試、Lint、TypeScript 檢查及 Build。
6. 不確定 API 或業務行為時，先確認後端實際實作，不得自行假設。
7. 新增頁面優先參考最接近的既有頁面，不從空白開始重造基礎元件。
8. 新增遠端資料功能時，依序確認 API 契約、型別、業務 API、TanStack Query 及頁面呈現。
9. 不得為單一頁面建立第二套 API Client、按鈕樣式或遠端資料管理方式。

### 核心架構原則

**API 不分流、UI 不分家、頁面只組裝、業務規則由後端負責。**

- API 統一收斂到 `client.ts` 與 `src/api/*.ts`。
- Server State 統一使用 TanStack Query。
- UI 統一使用 `ui.tsx` 的共用元件與樣式。
- 頁面只負責組裝 API、Query、表單及 UI，不重複發明基礎建設。
- 權限、資料隔離、資料驗證及業務規則由後端負責。

**前端負責呈現與操作，後端負責資料、權限及業務規則；優先沿用既有架構，保持修改範圍最小化。**