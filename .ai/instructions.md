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