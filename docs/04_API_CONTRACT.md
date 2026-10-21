# SMTMS - API Contract (API契約)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-21
- 基礎路徑：`/api/v1`
- 相關文件：[領域規則](./02_DOMAIN_RULES.md), [目前實作狀態](./06_CURRENT_STATE.md)

---

## 通用規範
### 認證方式
- 所有受保護端點需在Header攜帶：`Authorization: Bearer <access_token>`
- Token失效或無效回傳`401 Unauthorized`
- 權限不足回傳`403 Forbidden`

### 分頁格式
所有清單端點支援：
- `page`: 頁碼，預設1
- `page_size`: 每頁數量，預設20
- 回傳格式包含總數、目前頁、總頁數

### 錯誤格式
```json
{
  "detail": "錯誤描述文字"
}
```
- 400: 參數錯誤或業務邏輯不允許
- 404: 資源不存在
- 409: 資料重複或衝突
- 503: 服務無法使用（如Redis異常）

---

## 認證相關 API

### POST /auth/login
- **權限**：無需認證
- **請求**：
```json
{
  "username": "string",
  "password": "string"
}
```
- **回應**：`200 OK`
```json
{
  "access_token": "string",
  "token_type": "bearer"
}
```
- **實作狀態**：✅ 已實作

### POST /auth/logout
- **權限**：需認證
- **功能**：將目前Token加入撤銷名單
- **回應**：`204 No Content`
- **實作狀態**：✅ 已實作

### GET /auth/me
- **權限**：需認證
- **回應**：目前登入使用者資訊與權限清單
- **實作狀態**：✅ 已實作

---

## 健康檢查 API

### GET /health
- **權限**：無需認證
- **回應**：服務基本狀態
- **實作狀態**：✅ 已實作

### GET /health/live
- **權限**：無需認證
- **回應**：存活檢查
- **實作狀態**：✅ 已實作

### GET /health/ready
- **權限**：無需認證
- **回應**：就緒檢查（包含DB、Redis連線）
- **實作狀態**：✅ 已實作

### GET /health/database
- **權限**：無需認證
- **回應**：資料庫連線狀態
- **實作狀態**：✅ 已實作

### GET /health/redis
- **權限**：無需認證
- **回應**：Redis連線狀態
- **實作狀態**：✅ 已實作

---

## 供應商管理 API

### GET /suppliers
- **權限**：`suppliers:read`
- **功能**：供應商清單（分頁、搜尋）
- **實作狀態**：✅ 已實作

### POST /suppliers
- **權限**：`suppliers:write`
- **功能**：建立新供應商
- **實作狀態**：✅ 已實作

### GET /suppliers/{id}
- **權限**：`suppliers:read`
- **功能**：取得單一供應商詳細資料
- **實作狀態**：✅ 已實作

### PATCH /suppliers/{id}
- **權限**：`suppliers:write`
- **功能**：更新供應商資料
- **實作狀態**：✅ 已實作

### GET /suppliers/{id}/documents
- **權限**：`suppliers:read`
- **功能**：取得供應商的資格文件清單
- **實作狀態**：✅ 已實作

### POST /suppliers/{id}/materials
- **權限**：`suppliers:write`
- **功能**：建立供應商-物料供貨關聯
- **實作狀態**：✅ 已實作

### DELETE /suppliers/{supplier_id}/materials/{material_id}
- **權限**：`suppliers:write`
- **功能**：刪除供貨關聯
- **實作狀態**：✅ 已實作

---

## 物料管理 API

### GET /materials
- **權限**：`materials:read`
- **功能**：物料清單（分頁、搜尋）
- **實作狀態**：✅ 已實作

### POST /materials
- **權限**：`materials:write`
- **功能**：建立新物料
- **實作狀態**：✅ 已實作

### GET /materials/{id}
- **權限**：`materials:read`
- **功能**：取得單一物料詳細資料
- **實作狀態**：✅ 已實作

### PATCH /materials/{id}
- **權限**：`materials:write`
- **功能**：更新物料資料
- **實作狀態**：✅ 已實作

### GET /materials/{id}/suppliers
- **權限**：`materials:read`
- **功能**：取得可供應此物料的供應商清單
- **實作狀態**：✅ 已實作

---

## 供應商批次 API (供應商批次的CUD尚未實作)

### GET /supplier-lots
- **權限**：`supplier_lots:read`
- **功能**：供應商批次清單
- **實作狀態**：⚠️ 僅查詢已實作，建立/更新未實作

### GET /supplier-lots/{id}
- **權限**：`supplier_lots:read`
- **功能**：取得單一批次詳細資料
- **實作狀態**：⚠️ 僅查詢已實作

---

## 收料管理 API

### GET /receipts
- **權限**：`receipts:read`
- **功能**：收料單清單
- **實作狀態**：✅ 已實作（建立），更新/刪除未實作

### POST /receipts
- **權限**：`receipts:write`
- **功能**：建立新收料單
- **實作狀態**：✅ 已實作

### GET /receipts/{id}
- **權限**：`receipts:read`
- **功能**：取得收料單詳細資料
- **實作狀態**：⚠️ 404分支缺少測試

### POST /receipts/{id}/split
- **權限**：`receipts:write`
- **功能**：將收料拆分為多個內部批次
- **實作狀態**：✅ 已實作，部分邊界條件未測試

---

## 內部批次 API

### GET /internal-lots
- **權限**：`internal_lots:read`
- **功能**：內部批次清單
- **實作狀態**：✅ 查詢已實作，更新/刪除未實作

### GET /internal-lots/{id}
- **權限**：`internal_lots:read`
- **功能**：取得內部批次詳細資料
- **實作狀態**：✅ 已實作

---

## IQC 管理 API

### GET /iqc
- **權限**：`iqc:read`
- **功能**：IQC檢驗記錄清單
- **實作狀態**：✅ 已實作

### POST /iqc
- **權限**：`iqc:write`
- **功能**：建立新的IQC檢驗記錄
- **實作狀態**：✅ 已實作

### GET /iqc/{id}
- **權限**：`iqc:read`
- **功能**：取得IQC記錄詳細資料
- **實作狀態**：⚠️ 缺少自動化測試

### PATCH /iqc/{id}
- **權限**：`iqc:write`
- **功能**：更新IQC記錄
- **實作狀態**：✅ 更新邏輯已實作，缺少關聯一致性驗證（參見CURRENT_STATE.D4）

---

## 品質異常 API

### GET /nonconformances
- **權限**：`nonconformances:read`
- **功能**：不合格品記錄清單
- **實作狀態**：✅ 已實作

### POST /nonconformances
- **權限**：`nonconformances:write`
- **功能**：建立新的不合格品記錄
- **實作狀態**：✅ 已實作

### GET /nonconformances/{id}
- **權限**：`nonconformances:read`
- **功能**：取得不合格品詳細資料
- **實作狀態**：✅ 已實作

### PATCH /nonconformances/{id}
- **權限**：`nonconformances:write`
- **功能**：更新不合格品處理狀態
- **實作狀態**：✅ 已實作

---

## 未實作 API 清單
以下API於規格中定義，但尚未實作：
- ❌ 供應商批次建立/更新/刪除：`POST/PUT/DELETE /supplier-lots`
- ❌ 使用者管理API：所有`/users`相關端點
- ❌ 角色/權限管理API：所有`/roles`、`/permissions`相關端點
- ❌ 檔案上傳下載API：`POST /upload`、`GET /files/{id}`
- ❌ 追溯查詢API：`GET /trace/{lot_no}`

## 稽核紀錄 API

### GET /audit-logs
- **權限**：`audit:read`
- **查詢參數**：`actor_username`、`actor_user_id`、`action`、`resource_type`、`resource_id`、`start_at`、`end_at`、`page`、`page_size`（最大100）
- **回應**：`items`、`page`、`page_size`；紀錄包含操作者帳號、時間、操作類型、資源識別及異動前後內容。
- **限制**：僅提供GET查詢，無修改或刪除端點。

### GET /audit-logs/export.csv
- **權限**：`audit:read`
- **查詢參數**：與清單篩選條件相同；匯出套用所有篩選條件，不套用清單分頁。
- **回應**：UTF-8 CSV，後端以分批方式串流；欄位包含操作時間、操作者、操作類型、資源類型、資源ID及異動前後內容。
- **安全**：延用稽核內容敏感資料遮蔽，CSV 欄位進行公式注入防護。
