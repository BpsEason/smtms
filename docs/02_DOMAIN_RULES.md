# SMTMS - Domain Rules (領域規則)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-21
- 相關文件：[SRS](./01_SRS.md), [API契約](./04_API_CONTRACT.md), [目前實作狀態](./06_CURRENT_STATE.md)

---

## 業務不變條件清單
每條規則具有唯一ID，用於程式碼驗證與測試案例對應。

### DR-001：供應商代碼唯一性
- **規則描述**：同一系統內不能存在兩個相同的`supplier_code`
- **實作位置**：`backend/app/api/routes/suppliers.py`
- **資料庫約束**：`suppliers.supplier_code` 具有 UNIQUE 約束
- **測試證據**：有自動化測試涵蓋
- **狀態**：✅ 已實作並驗證

### DR-002：物料代碼唯一性
- **規則描述**：同一系統內不能存在兩個相同的`material_code`
- **實作位置**：`backend/app/api/routes/materials.py`
- **資料庫約束**：`materials.material_code` 具有 UNIQUE 約束
- **測試證據**：有自動化測試涵蓋
- **狀態**：✅ 已實作並驗證

### DR-003：供貨關聯唯一性
- **規則描述**：同一組合`(supplier_id, material_id)`只能存在一筆供貨關聯
- **實作位置**：資料庫層級約束
- **資料庫約束**：`supplier_materials.supplier_id + supplier_materials.material_id` UNIQUE
- **測試證據**：有自動化測試涵蓋
- **狀態**：✅ 已實作並驗證

### DR-004：首選供應商唯一性
- **規則描述**：同一物料只能有一個首選供應商(`is_preferred=true`)
- **實作位置**：程式碼層級驗證
- **測試證據**：有自動化測試涵蓋
- **狀態**：✅ 已實作並驗證

### DR-005：收料數量必須正數
- **規則描述**：建立收料時，`qty_received`必須>0
- **實作位置**：Schema驗證
- **測試證據**：未自動化測試
- **狀態**：⚠️ 規則存在但缺少測試

### DR-006：拆分數量限制
- **規則描述**：內部批次拆分的總數量不得超過原收料單的剩餘數量(`qty_remaining`)
- **實作位置**：`backend/app/api/routes/quality.py::split_receipt_into_internal_lots`
- **測試證據**：成功案例有測試，超量案例未測試
- **狀態**：⚠️ 部分驗證

### DR-007：內部批次編號唯一性
- **規則描述**：所有`internal_lot_no`必須唯一，不得重複
- **實作位置**：資料庫約束 + 程式碼檢查
- **測試證據**：部分測試
- **狀態**：⚠️ 單一請求內的重複未前置攔截

### DR-008：IQC結果與放行狀態配對
- **規則描述**：IQC檢驗結果(`inspection_result`)與放行狀態(`release_status`)必須符合合法組合
  - `passed`只能搭配`released`
  - `failed`只能搭配`rejected`或`quarantined`
  - `pending`只能搭配`hold`
- **實作位置**：Schema層級驗證 + 程式碼檢查
- **測試證據**：Schema層有測試
- **狀態**：✅ 已驗證

### DR-009：追溯鏈關聯一致性
- **規則描述**：`material_receipts.supplier_lot_id`必須對應到存在的供應商批次，且其供應商、物料必須與收料單一致
- **實作位置**：`backend/app/api/routes/quality.py`中部分驗證
- **測試證據**：未自動化測試
- **狀態**：⚠️ 部分實作

### DR-010：供貨關聯存在檢查
- **規則描述**：建立收料前，必須確認供應商與物料已建立供貨關聯
- **實作位置**：程式碼中有此檢查邏輯
- **錯誤訊息**："Supplier is not linked to the material"
- **測試證據**：未自動化測試
- **狀態**：⚠️ 程式碼存在但缺少測試

### DR-011：使用者隔離性
- **規則描述**：使用者只能存取自己有權限的供應商/物料資料（TBD：實際實作的隔離粒度）
- **實作位置**：`backend/app/api/routes/access.py`
- **測試證據**：有隔離性測試
- **狀態**：⚠️ 需進一步驗證完整範圍

### DR-012：IQC檢驗人自動綁定
- **規則描述**：建立IQC記錄時，`inspector_user_id`自動設定為目前登入的使用者，不得手動指定
- **實作位置**：`quality.py::create_iqc_record`
- **測試證據**：有自動化測試
- **狀態**：✅ 已驗證

### DR-013：內部批次狀態流轉
- **規則描述**：內部批次的`lot_status`只能依合法流程變更
  - `quarantined` → `available` (IQC通過放行)
  - `quarantined` → `rejected` (IQC失敗退回)
- **實作位置**：IQC建立時自動更新
- **測試證據**：有測試
- **狀態**：✅ 已驗證

### DR-014：Token撤銷機制
- **規則描述**：使用者登出後，該Token必須立即失效，無法再用於存取API
- **實作位置**：Redis存儲撤銷名單，每個請求檢查
- **測試證據**：有自動化測試
- **狀態**：✅ 已驗證

### DR-015：權限正規化
- **規則描述**：Seeder建立的`seed:*:*`權限，回傳給前端時必須正規化為`*:*`格式
- **實作位置**：認證流程中處理
- **測試證據**：有測試
- **狀態**：✅ 已驗證

---

## 待確認規則 (TBD)

### DR-TBD-001：供應商批次剩餘數量管理
- **問題**：供應商批次是否需要維護`qty_remaining`，收料時不能超過剩餘數量？
- **現況**：目前程式碼未實作此檢查

### DR-TBD-002：內部批次扣減邏輯
- **問題**：內部批次的`qty_on_hand`除了建立時的初始值，是否有生產領用時的扣減邏輯？
- **現況**：目前僅有建立，無出庫扣減流程

### DR-TBD-003：IQC結果回寫上游
- **問題**：IQC檢驗結果是否需要回寫供應商批次(`supplier_lots.qc_status`)或收料單的狀態？
- **現況**：目前僅更新內部批次狀態

### DR-004：稽核軌跡
- **規則描述**：重要業務資料異動與成功登入須記錄操作者、時間、操作類型、資源及異動內容；查詢須受 `audit:read` 權限控制，稽核資料唯讀。
- **實作位置**：`backend/app/services/audit.py`、`backend/app/api/routes/audit.py`、`frontend/src/pages/AuditLogPage.tsx`
- **敏感資料**：密碼、Token、金鑰、憑證及檔案路徑等欄位不寫入稽核內容；CSV 另防範公式注入。
- **現況**：ORM CREATE/UPDATE/DELETE 與成功 LOGIN 已記錄於業務交易；後台支援條件查詢、分頁、明細及批次串流 CSV 匯出。
- **限制**：失敗登入、登出、密碼變更與非 ORM 檔案操作尚未記錄；目前系統沒有 Request ID middleware，因此 Request ID 欄位通常為空。
- **測試證據**：稽核交易回滾、敏感欄位遮蔽、CSV 特殊字元及公式注入測試；前端篩選、分頁、明細及匯出測試。
- **狀態**：✅ 核心功能已實作；完整 API 整合測試需在可正常啟動 Windows TestClient 的環境補驗
