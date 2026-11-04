---
title: SMTMS 業務規則參考
last_verified: 2026-11-04
source: docs/02_DOMAIN_RULES.md (主要來源)
---

# SMTMS 業務規則文件

## 核心追溯鏈
```
供應商 → 供應商批次 → 收料紀錄 → 內部批次 → IQC 記錄
```
所有追溯節點必須保持關聯完整性，不可斷鏈。

---

## 正式領域規則 (Domain Rules)
本章节所有規則均來自 `docs/02_DOMAIN_RULES.md` 原始定義，完整保留原始DR編號與業務描述。

### DR-001：供應商代碼唯一性
- **原始規則描述**：同一系統內不能存在兩個相同的`supplier_code`
- **業務目的**：確保供應商識別的唯一性，避免資料混淆
- **相關資料及關聯**：suppliers 表，supplier_code 欄位
- **實際後端實作**：`backend/app/api/routes/suppliers.py`
- **資料庫約束**：`suppliers.supplier_code` 具有 UNIQUE 約束
- **對應測試**：有自動化測試涵蓋
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-002：物料代碼唯一性
- **原始規則描述**：同一系統內不能存在兩個相同的`material_code`
- **業務目的**：確保物料識別的唯一性，避免料號重複
- **相關資料及關聯**：materials 表，material_code 欄位
- **實際後端實作**：`backend/app/api/routes/materials.py`
- **資料庫約束**：`materials.material_code` 具有 UNIQUE 約束
- **對應測試**：有自動化測試涵蓋
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-003：供貨關聯唯一性
- **原始規則描述**：同一組合`(supplier_id, material_id)`只能存在一筆供貨關聯
- **業務目的**：避免重複建立供應商與物料的供貨關係
- **相關資料及關聯**：supplier_materials 表，supplier_id + material_id 複合鍵
- **實際後端實作**：資料庫層級約束
- **資料庫約束**：`supplier_materials.supplier_id + supplier_materials.material_id` UNIQUE
- **對應測試**：有自動化測試涵蓋
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-004：首選供應商唯一性
- **原始規則描述**：同一物料只能有一個首選供應商(`is_preferred=true`)
- **業務目的**：確保每個物料只有一個優先採購的供應商
- **相關資料及關聯**：supplier_materials 表，is_preferred 欄位
- **實際後端實作**：程式碼層級驗證
- **資料庫約束**：無
- **對應測試**：有自動化測試涵蓋
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-005：收料數量必須正數
- **原始規則描述**：建立收料時，`qty_received`必須>0
- **業務目的**：防止建立無效的零或負數收料單
- **相關資料及關聯**：material_receipts 表，qty_received 欄位
- **實際後端實作**：Schema驗證
- **資料庫約束**：CHECK 約束 (qty_received > 0)
- **對應測試**：未自動化測試
- **未完成事項**：自動化測試補全
- **驗證狀態**：IMPLEMENTED_UNTESTED

### DR-006：拆分數量限制
- **原始規則描述**：內部批次拆分的總數量不得超過原收料單的剩餘數量(`qty_remaining`)
- **業務目的**：確保拆分數量不超過可拆分的剩餘數量，維護數量一致性
- **相關資料及關聯**：material_receipts.qty_remaining, internal_lots.qty
- **實際後端實作**：`backend/app/api/routes/quality.py::split_receipt_into_internal_lots`
- **資料庫約束**：無
- **對應測試**：成功案例有測試，超量案例未測試
- **未完成事項**：超量邊界案例測試
- **驗證狀態**：PARTIAL

### DR-007：內部批次編號唯一性
- **原始規則描述**：所有`internal_lot_no`必須唯一，不得重複
- **業務目的**：確保內部批次編號的全球唯一性，便於追溯
- **相關資料及關聯**：internal_lots 表，internal_lot_no 欄位
- **實際後端實作**：資料庫約束 + 程式碼檢查
- **資料庫約束**：`internal_lots.internal_lot_no` UNIQUE
- **對應測試**：部分測試
- **未完成事項**：單一請求內的重複未前置攔截
- **驗證狀態**：PARTIAL

### DR-008：IQC結果與放行狀態配對
- **原始規則描述**：IQC檢驗結果(`inspection_result`)與放行狀態(`release_status`)必須符合合法組合
  - `passed`只能搭配`released`
  - `failed`只能搭配`rejected`或`quarantined`
  - `pending`只能搭配`hold`
- **業務目的**：確保檢驗結果與放行狀態的邏輯一致性，防止非法狀態組合
- **相關資料及關聯**：iqc_records 表，inspection_result, release_status 欄位
- **實際後端實作**：Schema層級驗證 + 程式碼檢查
- **資料庫約束**：CHECK 約束 (狀態組合合法性)
- **對應測試**：Schema層有測試
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-009：追溯鏈關聯一致性
- **原始規則描述**：`material_receipts.supplier_lot_id`必須對應到存在的供應商批次，且其供應商、物料必須與收料單一致
- **業務目的**：維護追溯鏈的完整性，避免建立不一致的關聯
- **相關資料及關聯**：material_receipts.supplier_lot_id → supplier_lots.id
- **實際後端實作**：`backend/app/api/routes/quality.py`中部分驗證
- **資料庫約束**：外鍵約束
- **對應測試**：未自動化測試
- **未完成事項**：完整的一致性檢查邏輯實作
- **驗證狀態**：PARTIAL

### DR-010：供貨關聯存在檢查
- **原始規則描述**：建立收料前，必須確認供應商與物料已建立供貨關聯
- **業務目的**：防止從未建立供貨關係的供應商收料，確保採購流程合規
- **相關資料及關聯**：建立收料前檢查 supplier_materials 關聯存在性
- **實際後端實作**：程式碼中有此檢查邏輯
- **錯誤訊息**："Supplier is not linked to the material"
- **資料庫約束**：無
- **對應測試**：未自動化測試
- **未完成事項**：自動化測試補全
- **驗證狀態**：IMPLEMENTED_UNTESTED

### DR-011：使用者隔離性
- **原始規則描述**：使用者只能存取自己有權限的供應商/物料資料（TBD：實際實作的隔離粒度）
- **業務目的**：實現資料存取權限隔離，確保使用者只能存取授權範圍內的資料
- **相關資料及關聯**：所有資源查詢的存取控制
- **實際後端實作**：`backend/app/api/routes/access.py`
- **資料庫約束**：無
- **對應測試**：有隔離性測試
- **未完成事項**：需進一步驗證完整範圍
- **驗證狀態**：PARTIAL

### DR-012：IQC檢驗人自動綁定
- **原始規則描述**：建立IQC記錄時，`inspector_user_id`自動設定為目前登入的使用者，不得手動指定
- **業務目的**：確保IQC檢驗記錄的責任歸屬正確，防止冒用他人名義建立檢驗記錄
- **相關資料及關聯**：iqc_records.inspector_user_id 自動填入
- **實際後端實作**：`quality.py::create_iqc_record`
- **資料庫約束**：無
- **對應測試**：有自動化測試
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-013：內部批次狀態流轉
- **原始規則描述**：內部批次的`lot_status`只能依合法流程變更
  - `quarantined` → `available` (IQC通過放行)
  - `quarantined` → `rejected` (IQC失敗退回)
- **業務目的**：確保內部批次狀態只能按照正確的品質流程轉變，防止非法狀態跳轉
- **相關資料及關聯**：internal_lots.lot_status 狀態機
- **實際後端實作**：IQC建立時自動更新
- **資料庫約束**：無
- **對應測試**：有測試
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-014：Token撤銷機制
- **原始規則描述**：使用者登出後，該Token必須立即失效，無法再用於存取API
- **業務目的**：確保登出後的安全性，防止Token被盜用
- **相關資料及關聯**：JWT Token 黑名單機制
- **實際後端實作**：Redis存儲撤銷名單，每個請求檢查
- **資料庫約束**：無
- **對應測試**：有自動化測試
- **未完成事項**：無
- **驗證狀態**：VERIFIED

### DR-015：權限正規化
- **原始規則描述**：Seeder建立的`seed:*:*`權限，回傳給前端時必須正規化為`*:*`格式
- **業務目的**：隱藏內部seed前綴，保持前端權限格式的一致性
- **相關資料及關聯**：認證流程中的權限處理
- **實際後端實作**：認證流程中處理
- **資料庫約束**：無
- **對應測試**：有測試
- **未完成事項**：無
- **驗證狀態**：VERIFIED

---

## 待確認規則 (TBD)
來自 `docs/02_DOMAIN_RULES.md` 中標記為待確認的規則

### DR-TBD-001：供應商批次剩餘數量管理
- **問題**：供應商批次是否需要維護`qty_remaining`，收料時不能超過剩餘數量？
- **現況**：目前程式碼未實作此檢查
- **驗證狀態**：UNKNOWN

### DR-TBD-002：內部批次扣減邏輯
- **問題**：內部批次的`qty_on_hand`除了建立時的初始值，是否有生產領用時的扣減邏輯？
- **現況**：目前僅有建立，無出庫扣減流程
- **驗證狀態**：UNKNOWN

### DR-TBD-003：IQC結果回寫上游
- **問題**：IQC檢驗結果是否需要回寫供應商批次(`supplier_lots.qc_status`)或收料單的狀態？
- **現況**：目前僅更新內部批次狀態
- **驗證狀態**：UNKNOWN

### DR-TBD-004：稽核軌跡
- **原始規則描述**：重要業務資料異動與成功登入須記錄操作者、時間、操作類型、資源及異動內容；查詢須受 `audit:read` 權限控制，稽核資料唯讀。
- **敏感資料**：密碼、Token、金鑰、憑證及檔案路徑等欄位不寫入稽核內容；CSV 另防範公式注入。
- **實際後端實作**：`backend/app/services/audit.py`、`backend/app/api/routes/audit.py`
- **實際前端實作**：`frontend/src/pages/AuditLogPage.tsx`
- **現況**：ORM CREATE/UPDATE/DELETE 與成功 LOGIN 已記錄於業務交易；後台支援條件查詢、分頁、明細及批次串流 CSV 匯出。
- **限制**：失敗登入、登出、密碼變更與非 ORM 檔案操作尚未記錄；目前系統沒有 Request ID middleware，因此 Request ID 欄位通常為空。
- **對應測試**：稽核交易回滾、敏感欄位遮蔽、CSV 特殊字元及公式注入測試；前端篩選、分頁、明細及匯出測試。
- **驗證狀態**：IMPLEMENTED_UNTESTED

---

## 系統技術規範 (System Technical Rules)
以下為原始DR以外的系統技術實作規範，非業務領域規則

### JWT Token 撤銷
- 功能描述：使用者登出後Token立即失效，存入Redis黑名單
- 實作位置：Redis存儲撤銷名單，每個請求檢查
- 狀態：已實作

### RBAC 權限管理
- 功能描述：基於角色的權限存取控制系統
- 實作位置：認證與授權中間件
- 狀態：已實作

### Redis 使用規範
- 功能描述：用於Token黑名單、快取等場景
- 狀態：已實作

### API 分頁格式
- 功能描述：所有列表API必須支援統一分頁參數(page, page_size)，回傳標準化分頁格式
- 實作位置：所有路由的PaginatedResponse格式
- 狀態：已實作

### CSV 公式注入防護
- 功能描述：CSV匯出時防範公式注入攻擊，特殊字元處理
- 實作位置：CatalogPages.tsx 第800行的公式中和邏輯
- 狀態：已實作

### 稽核紀錄技術實作
- 功能描述：稽核軌跡的技術實現細節，包括敏感資料過濾、CSV匯出
- 實作位置：audit.py 服務、稽核記錄寫入邏輯
- 狀態：已實作，部分功能待補全

### 資料庫 Session 管理
- 功能描述：資料庫連線與事務管理
- 狀態：已實作

---

## 業務流程狀態轉換
### 供應商批次流程
`待收貨 → 部分收貨 → 已收貨 → 已完成`

### 內部批次流程
`待檢驗 → 檢驗中 → 合格/不合格 → 已入庫`

### 資料關聯約束
- 所有批次與供應商必須綁定
- 所有關聯記錄必須指向存在的上游資源
- 不可建立循環關聯

## 供應商隔離規則（已驗證）
1. 供應商帳號的 `supplier_id` 不可修改
2. 所有查詢自動加入 `supplier_id = current_user.supplier_id` 過濾
3. 建立資源時自動填入 `supplier_id = current_user.supplier_id`
4. 更新/刪除前先驗證歸屬

## 已知缺口
- DR-006（拆分數量限制）缺少超量邊界案例測試
- DR-007（內部批次編號唯一性）缺少單一請求內重複的前置攔截
- DR-009（追溯鏈關聯一致性）缺少完整的一致性檢查邏輯
- 部分邊界狀態的測試覆蓋不足
- 缺少批量操作的交易原子性驗證