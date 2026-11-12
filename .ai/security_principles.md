# SMTMS API 安全原則（主要來源）

> 狀態說明：本文件依據 2026-11-04 API 安全稽核結果整理，作為 SMTMS API 安全原則的唯一來源（Single Source of Truth）。  
> 本次僅整合文件與開發規範，**未實作任何安全修補、未修改 API/JWT/RBAC/資料庫 Schema**。  
> 文件中標示為「待改善/待驗證」之項目，**不得視為已完成或確定漏洞**，實作前須先查證現況。

## 一、安全改善優先順序（文件治理）

| 優先順序 | 項目 | 狀態 | 說明 |
|---|---|---|---|
| 高 | 登入 API Rate Limiting | 待改善（未實作） | 登入與認證敏感端點目前未見明確速率限制，需評估並實作限制策略（建議利用既有 Redis） |
| 高 | Dashboard 權限檢查一致性 | 待改善（待查證/修正） | 部分 Dashboard 端點以 `require_password_changed` 作為主要存取門檻，應改為與其他端點一致的權限檢查模式 |
| 高 | Refresh Token 驗證使用者是否仍啟用 | 待改善（未實作/待查證） | Refresh 流程需確認使用者仍為啟用狀態，避免停用帳號持續換發 Token |
| 中 | Update Schema 敏感欄位控制 | 待改善（待查證） | Update Schema/更新流程需明確排除敏感欄位（如 `role_id`、`is_superuser`、`is_active`、`supplier_id` 等） |
| 中 | Response Schema 敏感資料檢查 | 待改善（待查證） | 需稽核回應模型與巢狀序列化，避免洩漏敏感欄位或跨供應商資料 |
| 中 | 供應商資料隔離邊界驗證 | 待改善（待查證） | 部分端點與複雜查詢的隔離邊界需補強驗證（含關聯資源、Dashboard/追溯等情境） |
| 低 | Production CORS 白名單確認 | 待驗證 | 需確認正式環境 `CORS` 來源設定為明確白名單，非萬用來源 |
| 低 | 其他 JWT 改善建議 | 待評估 | 例如並行登入限制等，需依安全需求評估；**Token Jitter 不列為必要實作項目** |

## 二、端點權限控制（Endpoint Permission Control）

### 已確認實作（依稽核）
- 多數受保護端點已使用 `require_permission()`（如 suppliers、materials、receipts、iqc 等）。
- `/suppliers` 路由模組與子路由具備權限相依檢查。
- 供應商細節/查詢/更新端點會呼叫 `ensure_supplier_access()`。
- 供應商帳號（`current_user.supplier_id is not None`）之查詢會自動依 `supplier_id` 過濾。
- 部分 Dashboard/Quality 端點使用 `require_password_changed` 相依。

### 識別缺口（待改善/待查證）
- Dashboard 端點使用 `require_password_changed` 而非一致的權限檢查，可能造成存取門檻不一致。
- 部分品質端點使用多權限組合（如 `require_any_permission(...)`），權限粒度是否適當需依實際需求查證。
- `/api/v1/auth/me` 主要依賴 JWT 驗證（作為個人資料端點可接受），但需維持最小暴露原則。

### 原則
- 管理/CRUD 端點應具備明確的 `require_permission()` 或 `require_role()` 相依。
- 涉及供應商範圍的端點應呼叫 `ensure_supplier_access(current_user, supplier_id)` 或等效資料庫層限制。
- 供應商使用者之列表/查詢必須在資料庫查詢層自動套用 `supplier_id` 範圍。
- `require_password_changed` 用於強制變更密碼流程，不應取代一般權限控管作為主要存取門檻（待改善項目）。

## 三、供應商資料隔離（Supplier Data Isolation）

### 已確認實作（依稽核）
- 列表端點（如 suppliers/materials/receipts）對供應商帳號有自動過濾。
- 細節端點在回傳前進行供應商存取驗證（`ensure_supplier_access()` 或等效檢查）。
- 建立/更新端點在寫入前驗證供應商存取權與關聯資源歸屬。
- 供應商批次、IQC、內部批次等相關操作已限制於使用者所屬供應商範圍。

### 識別缺口（待改善/待查證）
- `materials` 相關端點（如依 ID 取得、列出關聯供應商）之供應商歸屬驗證完整性需再查證。
- Dashboard 品質查詢與複雜聯結條件在邊界情境下可能需補強驗證。
- `/api/v1/traceability` 等查詢在搜尋條件與關聯資料上需確認不會跨供應商洩漏。

### 原則
- 單筆查詢/更新/刪除：必須驗證資源歸屬（`ensure_supplier_access()` 或等效 DB 層限制）。
- 列表/搜尋/分頁：**必須**在資料庫查詢層限制可存取範圍，禁止先取全量再於記憶體過濾。
- 建立關聯資料：必須驗證所有關聯資源屬於同一供應商（避免跨供應商關聯）。
- 不可僅信任前端傳入之 `supplier_id` 或資源 ID；必須以 `current_user` 權限與歸屬為準。

## 四、Pydantic Schema 與大量指派防護（Mass Assignment）

### 已確認實作（依稽核）
- Create/Update/Response Schema 多數已明確定義欄位。
- 部分更新流程使用 `model_dump(exclude_unset=True)` 並搭配重複性檢查（如 `supplier_code`）。
- IQC 等 Schema 具備欄位與狀態組合驗證。

### 識別缺口（待改善/待查證）
- Update Schema/更新流程未必對敏感欄位做明確排除，存在大量指派風險（依實作而異，需逐端點查證）。
- 可能接受不應由一般使用者修改的欄位（如 `role_id`、`is_superuser`、`is_active`、`supplier_id`、密碼相關欄位）。

### 原則
- Request Schema 應採輸入白名單，僅允許本次操作必要欄位。
- 更新操作應明確排除敏感欄位（例如使用 `exclude` 或明確欄位映射），避免將權限/歸屬欄位交由請求控制。
- 密碼變更應使用既有專用流程與驗證，不得透過一般 Update Schema 任意寫入。
- **不得將尚未查證的疑慮描述為確定漏洞**；修改前須確認實際 Schema 與端點行為。

## 五、API 回應序列化與敏感資料（Response Serialization）

### 已確認實作（依稽核）
- 多數端點使用 Pydantic Response Model 序列化回應。
- 關聯資料常以 `selectinload` 載入以支援序列化。

### 識別缺口（待改善/待查證）
- 需確認所有 Response Schema 未暴露 `password_hash`、Token、內部識別資訊或其他敏感欄位。
- 巢狀關聯序列化需確認不會洩漏跨供應商資料或非授權欄位。

### 原則
- Response Schema 應採輸出白名單思維，僅回傳前端/呼叫端所需欄位。
- 禁止直接回傳未經控制的 ORM 物件或包含敏感欄位的資料結構。
- 巢狀關聯回應需同步檢查供應商資料隔離與欄位暴露範圍。

## 六、CORS 與 CSRF

### 已確認實作（依稽核）
- 開發環境 CORS 來源為明確設定（非萬用來源）。
- 使用 `Authorization: Bearer` JWT 認證（非 Cookie 型認證），相對降低 CSRF 風險。

### 識別缺口（待驗證/待改善）
- Production CORS 白名單需實際確認部署設定。
- 前端 Token 儲存與 XSS 防護屬實作面風險，需依現況評估（本文件不變更實作）。

### 原則
- 不得使用 `allow_origins=["*"]` 搭配 `allow_credentials=True`。
- Production CORS 必須使用明確白名單來源（待驗證）。
- 維持既有 Bearer Token 認證模式；不得為新增功能引入破壞既有機制的變更。

## 七、Rate Limiting

### 已確認狀態（依稽核）
- 目前未見明確的登入/API 速率限制機制（待查證/待改善）。

### 原則與改善方向（待改善）
- 登入與認證敏感端點應評估加入 Rate Limiting（高優先級，尚未實作）。
- 建議優先利用既有 Redis 基礎設施，並設定合理門檻以兼顧安全與可用性。
- 本次僅納入規範，不實作程式碼變更。

## 八、JWT 與認證（Authentication）

### 已確認實作（依稽核）
- JWT 撤銷機制透過 Redis 黑名單（jti）運作。
- Refresh Token Rotation 已實作；密碼變更會撤銷既有 Refresh Token。
- Access/Refresh Token 具有效期設定與必要聲明（claims）。

### 識別缺口（待改善/待查證）
- Refresh 流程是否驗證使用者仍啟用需確認並補強（高優先級）。
- 並行登入限制、Token 抖動等屬進一步強化項目，需評估必要性與相容性。

### 原則（必須維持）
- 不得繞過既有 JWT 撤銷與 Refresh Token Rotation 機制。
- 不得更換現有 JWT 架構；所有改善須維持 API 向後相容。
- **Token Jitter 不列為必要實作項目**（可列為低優先評估，但不得作為必要需求）。

## 九、開發時必須遵守的安全原則摘要

### 必須維持（既有能力，不得破壞）
1. 供應商資料隔離與 `ensure_supplier_access()` 等既有存取控制。
2. 供應商帳號查詢/列表的自動範圍限制。
3. 既有 RBAC 權限檢查機制（`require_permission()` / `require_role()`）。
4. JWT 撤銷（Redis）與 Refresh Token Rotation。
5. 密碼變更後既有 Refresh Token 撤銷行為。
6. Bearer Token 認證與既有 CORS 安全前提（不得放寬為不安全組態）。

### 建議改善（依優先順序規劃，尚未完成）
1. 高：登入 API Rate Limiting、Dashboard 權限檢查一致性、Refresh Token 驗證使用者仍啟用。
2. 中：Update Schema 敏感欄位控制、Response Schema 敏感資料檢查、供應商資料隔離邊界驗證。
3. 低：Production CORS 白名單確認、其他 JWT 改善建議（Token Jitter 非必要）。

### 禁止事項
- 不得移除既有安全規則或繞過既有權限/隔離機制。
- 不得為了新增功能破壞既有 RBAC、JWT 撤銷與 Refresh Token Rotation。
- 不得透過 Request Schema 允許一般使用者修改敏感欄位。
- 不得直接暴露未經控制的 ORM 資料或敏感欄位。
- 不得將未驗證疑慮寫成確定漏洞，亦不得將未實作項目標示為已完成。
- 不得更換現有 JWT 架構；所有修改必須維持 API 向後相容。

## 十、稽核備註
- 稽核顯示現有程式碼具備良好安全基礎（RBAC、JWT、供應商隔離），多數缺口屬一致性、設定或邊界驗證問題。
- 後續改善應採最小修改與向後相容策略，並以實際查證與測試結果為準。