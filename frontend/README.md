# SMTMS 前端

SMTMS（Supplier Material Traceability Management System）是供應商、物料追溯與品質管理系統。本目錄包含供現場作業與展示使用的 Web 前端，透過 REST API 與 FastAPI 後端交換資料。

前端負責呈現供應商與物料目錄、收料、內部批次及 IQC 作業介面，提交使用者操作並顯示後端回應。資料驗證、JWT 驗證、權限判斷及業務規則均由後端負責；前端依登入者權限調整導覽和操作可見性，不能取代伺服器端授權。

## 技術與依賴

- React 19、TypeScript、Vite 8、React Router 7。
- Tailwind CSS 4，透過 `@tailwindcss/vite` 整合 Vite。
- 共用 UI 元件以 Tailwind 樣式實作；Radix Dialog 提供操作確認對話框，Lucide React 提供圖示。**目前沒有安裝 shadcn/ui CLI 或官方元件套件**，因此本專案不將 shadcn/ui 列為已整合依賴。
- `fetch` API client 與 FastAPI REST API 整合；登入使用 JWT Bearer Token。
- Vitest、jsdom、Testing Library 用於前端測試；Oxlint 用於程式碼檢查。

實際依賴及可用指令以 [package.json](package.json) 為準。前端未使用 TanStack Table 或 Recharts。

## 目前已實作頁面與功能

- **登入**：呼叫現有登入及使用者資料端點；Token 暫存於瀏覽器 `localStorage`，API client 以 Bearer Token 呼叫受保護端點。登出呼叫後端登出端點；遇到受保護請求 `401` 時清除本機登入狀態。
- **Overview**：顯示現有列表 API 的總筆數、近期收料及依 IQC `pending` 結果篩選的待檢筆數。這些是列表統計，不是良率、缺陷率或趨勢 KPI。
- **Suppliers**：供應商列表、關鍵字搜尋、後端分頁及建立供應商。
- **Materials**：物料列表、關鍵字搜尋、後端分頁及建立物料。
- **Material receipt**：載入供應商、物料與現有供應商批次選項，建立收料、查看收料明細，並將收料數量拆分為內部批次。新增或狀態變更操作會要求確認。
- **Internal lots**：內部批次列表、關鍵字搜尋及後端分頁。
- **IQC inspection**：對現有內部批次建立檢驗紀錄；檢驗結果與放行狀態依後端接受的配對選取，並讀取後端回傳的批次狀態。
- 共用頁面標題、表格、狀態標籤、表單欄位、載入中、空資料、錯誤及確認狀態；導覽與寫入操作依 `/auth/me` 回傳的權限顯示。

目前後端沒有供應商批次建立介面、整合式批次追溯查詢或品質趨勢統計 API。收料表單需使用既有供應商批次；Overview 不推算或虛構品質 KPI。各頁顯示的權限控制僅為 UI 體驗，後端仍負責實際授權。

## 前端目錄

```text
frontend/
├── .gitignore
├── .oxlintrc.json
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── Dockerfile
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
  ├── App.tsx
  ├── App.test.tsx
  ├── main.tsx
  ├── index.css
  ├── types.ts
  ├── vite-env.d.ts
  ├── api/
  │   └── client.ts
  ├── components/
  │   ├── AppLayout.tsx
  │   └── ui.tsx
  ├── lib/
  │   └── data.ts
  ├── pages/
  │   ├── CatalogPages.tsx
  │   ├── DashboardPage.tsx
  │   ├── LoginPage.tsx
  │   └── WorkflowPages.tsx
  ├── test/
  │   └── setup.ts
  └── assets/
      ├── hero.png
      ├── react.svg
      └── vite.svg
```

## Windows PowerShell 安裝

請先安裝 Node.js `^20.19.0`、`^22.12.0` 或 `>=24.0.0`（Vite 8 支援的版本範圍）及 npm，然後在儲存庫根目錄開啟 PowerShell：

```powershell
Set-Location .\frontend
npm install
```

`npm install` 會依 `package.json` 安裝依賴，並使用前端目錄內的 `package-lock.json`。

## 環境變數與 API Base URL

唯一由前端讀取的自訂環境變數是 `VITE_API_BASE_URL`。目前未設定時，預設為 `http://localhost:8000`。此變數應設定為 **API origin**，不要加上 `/api/v1` 路徑，因為 API client 會自行組合 `/api/v1/...` 端點。

若後端使用不同位址，可在 `frontend` 目錄建立本機 `.env.local`：

```powershell
Set-Content -Path .env.local -Value 'VITE_API_BASE_URL=http://localhost:8000'
```

將範例位址換成實際後端 origin。Vite 啟動時會載入此設定；新增或修改環境變數後，請重新啟動開發伺服器。不要在前端環境變數放入密碼、JWT Secret 或其他機密；`VITE_` 變數會被提供給瀏覽器端程式。

## 啟動前端

在 `frontend` 目錄執行：

```powershell
npm run dev
```

Vite 預設會提供 `http://localhost:5173`。可用以下方式指定僅供本機存取的 host：

```powershell
npm run dev -- --host 127.0.0.1
```

## 測試、Lint 與正式建置

以下指令皆對應目前 `package.json` 中已存在的 scripts：

```powershell
npm test
npm run lint
npm run build
```

- `npm test` 執行 Vitest 測試；前端測試以 mock API 驗證登入及收料、拆批、IQC 核心流程，不需連接後端或建立資料。
- `npm run lint` 執行 Oxlint。
- `npm run build` 先執行 TypeScript project build，再產生 Vite 正式建置檔至 `frontend/dist/`。
- `npm run preview` 可在本機預覽已建置的前端。

## 連接本機 FastAPI 後端

1. 依 [後端 README](../backend/README.md) 安裝後端依賴、設定本機後端 `.env`，並確認 MySQL 與 Redis 已可供後端使用。不要將含有機密的 `.env` 提交至 Git。
2. 在另一個 PowerShell 視窗，從儲存庫根目錄啟動後端：

   ```powershell
	Set-Location .\backend
   uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. 在另一個 PowerShell 視窗，從儲存庫根目錄啟動前端：

   ```powershell
   Set-Location .\frontend
   npm run dev
   ```

   開啟 `http://localhost:5173`。後端 OpenAPI 文件位於 `http://localhost:8000/docs`。
4. 後端 CORS 設定需允許前端實際使用的 origin。範例設定包含 `http://localhost:5173` 與 `http://127.0.0.1:5173`；兩者是不同 origin，請與瀏覽器網址一致。

前端登入後會依 API 契約傳送 Bearer Token；後端驗證 Token、處理撤銷狀態並判定每個 API 的權限。若使用者收到 `403`，應確認後端角色／權限設定，而非只調整前端導覽。

目前前端依既有實作將 Token 存於 `localStorage`。這是目前專案的 session 儲存方式，不代表適用於所有正式環境；部署前應依威脅模型評估瀏覽器端儲存與 XSS 防護。

## 常見問題

| 狀況 | 檢查方式 |
| --- | --- |
| `npm run ...` 找不到 script | 確認目前目錄是 `frontend`；僅 `dev`、`build`、`lint`、`test`、`preview` 是已設定的 scripts。 |
| 前端無法連到 API | 確認 FastAPI 正在 `8000` 埠執行；檢查 `VITE_API_BASE_URL` 是否為 API origin，且沒有加上 `/api/v1`。 |
| 瀏覽器顯示 CORS 錯誤 | 檢查後端 `CORS_ORIGINS` 是否包含目前瀏覽器使用的前端 origin，並確認修改後端設定後有重新啟動後端。 |
| 登入後立即回到登入頁 | Token 無效、已撤銷或 `/auth/me` 無法通過驗證時，前端會清除本機登入狀態；重新登入並檢查後端／Redis 狀態。 |
| API 回應 `403` | 代表後端拒絕目前帳號的權限；請確認帳號角色及權限，不要把前端隱藏按鈕視為安全控制。 |
| 收料沒有可選的供應商批次 | 前端使用 API 已存在的 supplier lot；目前沒有供應商批次建立 API，請確認後端已有符合所選供應商及物料的批次。 |
| 改了 `.env.local` 但 API 位址沒變 | 確認變數名稱是 `VITE_API_BASE_URL`，檔案位於 `frontend` 根目錄，並重新啟動 Vite。 |
| 測試無法連上後端 | 前端測試使用 mock API；若測試失敗，先確認 Node/npm 版本與 `npm install` 是否完成。 |
