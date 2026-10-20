# SMTMS - Current State (目前實作狀態)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-20
- 相關文件：[驗收標準](./07_ACCEPTANCE.md), [開發路線圖](./08_ROADMAP.md)

---

## 功能完成度總覽

### ✅ Implemented（完全實作且有測試）
| 功能模組 | 功能說明 | 實作路徑 | 測試狀態 |
|---------|---------|---------|---------|
| 認證系統 | JWT登入登出、Token撤銷 | `backend/app/api/routes/auth.py` | ✅ 全自動化測試 |
| 健康檢查 | 所有/health端點 | `backend/app/api/routes/health.py` | ✅ 有測試 |
| 供應商CRUD | 建立、查詢、更新、搜尋分頁 | `backend/app/api/routes/suppliers.py` | ✅ 有測試 |
| 物料CRUD | 建立、查詢、更新、搜尋分頁 | `backend/app/api/routes/materials.py` | ✅ 有測試 |
| 供貨關聯 | 建立/刪除供應商-物料關聯、首選供應商 | `suppliers.py` | ✅ 有測試 |
| 收料建立 | 建立收料單、基本驗證 | `backend/app/api/routes/quality.py` | ✅ 建立流程有測試 |
| 內部批次拆分 | 收料拆分為多個內部批次 | `quality.py::split_receipt_into_internal_lots` | ⚠️ 成功案例有測試，邊界條件不全 |
| IQC建立 | 建立IQC記錄、自動更新批次狀態 | `quality.py::create_iqc_record` | ✅ 有測試 |
| IQC更新 | 更新IQC記錄、狀態同步 | `quality.py::update_iqc_record` | ✅ 更新邏輯有測試 |
| 不合格品管理 | 建立、更新不合格品記錄 | `backend/app/api/routes/nonconformances.py` | ✅ 基本流程有測試 |

### ⚠️ Partially Implemented（部分實作）
| 功能模組 | 功能說明 | 已實作 | 缺少部分 |
|---------|---------|---------|---------|
| 供應商批次管理 | supplier_lots的管理 | 僅GET查詢 | POST/PUT/DELETE都未實作 |
| 供應商資格文件 | 文件管理 | 僅GET查詢 | 上傳、更新、刪除未實作 |
| 權限管理系統 | 使用者/角色/權限的CRUD | 僅權限驗證機制 | 管理API完全未實作 |
| 前端建置流程 | 生產環境建置 | 開發模式可運行 | Dockerfile為dev模式，未建置生產產物 |

### ❌ Not Implemented（完全未實作）
| 功能項目 | 說明 | 優先級 |
|---------|------|--------|
| 供應商/物料/收料等的刪除功能 | 所有資源的DELETE端點 | P2 |
| 檔案上傳下載功能 | 供應商文件等的實體檔案處理 | P2 |
- 追溯查詢API：由批次反查完整履歷 | P1
- 稽核軌跡(audit log) | 所有資料異動記錄 | P2
- CAPA整改流程 | 完整的矯正預防措施流程 | P2
- 報表匯出功能 | Excel/PDF匯出 | P3
- 郵件通知系統 | 異常通知、待辦提醒 | P3

---

## 🐛 Known Bugs（已知缺陷）
每個缺陷包含唯一ID、問題描述、影響範圍、現有程式碼位置。

### D1: ID配置競態條件
- **問題**：主鍵非AUTO_INCREMENT，以`max(id)+1`配置，併發下可能撞號引發IntegrityError
- **影響檔案**：`materials.py`、`suppliers.py`、`quality.py`中的`_next_id`函數
- **嚴重性**：高（可能導致資料寫入失敗）
- **暫繞方式**：開發環境使用者少，尚未發生；生產環境需先修復

### D2: IQC建立非原子交易
- **問題**：先commit IQC記錄、再commit批次狀態，第二段失敗會留下不一致的資料
- **影響函數**：`quality.py::create_iqc_record`
- **嚴重性**：中（僅進出錯時發生，機率低）

### D3: 單一請求內重複批號未前置攔截
- **問題**：批次重複檢查逐筆查DB，未比對同請求內的重複值，可能於flush時拋出未處理的例外
- **影響函數**：`quality.py::split_receipt_into_internal_lots`
- **嚴重性**：中

### D4: IQC更新未驗證新關聯一致性
- **問題**：`PATCH /iqc/{id}`修改`receipt_id`/`internal_lot_id`時，未驗證歸屬關係與物料一致性
- **影響函數**：`quality.py::update_iqc_record`
- **嚴重性**：中（可能破壞追溯鏈）

### D5: Nginx `/health/`尾斜線路由問題
- **問題**：Nginx代理至`/api/v1/health/`，後端無此路由，依賴FastAPI自動重導
- **影響檔案**：`docker/nginx/default.conf`
- **嚴重性**：低（功能正常但依賴重導）

### D6: README與docker-compose.yml連接埠不一致
- **問題**：README記載Nginx對外連接埠80，實際Compose映射為8087
- **影響檔案**：根目錄`README.md`、`docker-compose.yml`
- **嚴重性**：低（僅文件問題）

### D7: 前端Dockerfile執行開發模式
- **問題**：前端容器`CMD`執行`npm run dev`，非生產環境的靜態檔案服務
- **影響檔案**：`frontend/Dockerfile`
- **嚴重性**：中（不適合生產部署）

### D8: 殘留無原始檔的pyc快取
- **問題**：`app/services/__pycache__/auth_service.cpython-313.pyc`存在，但無對應.py原始檔
- **影響**：僅雜項，不影響運行
- **嚴重性**：低

---

## ❓ Not Verified（已實作但缺少驗證證據）
| 項目 | 說明 | 缺少什麼驗證 |
|---------|------|-------------|
| supplier_lots.qc_status狀態流轉 | 供應商批次的品質狀態更新 | 無程式碼會更新此字段，建立後從未變更 |
| material_receipts.status流轉 | 收料單狀態 | 建立後狀態從未更新 |
| DB/Redis不可用時的實際行為 | 當外部服務中斷時的處理 | 未在無服務環境驗證過A22/A23場景 |
| 收料一致性檢查的錯誤處理 | A14/A15的驗證邏輯 | 缺少自動化測試覆蓋這些錯誤分支 |
| 前端`npm run build`結果 | 生產建置是否能成功 | 從未在目前工作區執行過完整建置 |
| /health/ready的真實環境判定 | 在真實MySQL/Redis下的ready/degraded邏輯 | 僅在測試的記憶體DB驗證過 |

---

## 測試覆蓋現況
### 後端測試
- 執行方式：`uv run pytest` (於backend/)
- 目前結果：17個測試通過，1個StarletteDeprecationWarning
- 測試覆蓋範圍：認證、RBAC、基礎CRUD有較好覆蓋；品質流程的邊界條件覆蓋不足

### 前端測試
- 執行方式：`npm test` (於frontend/)
- 目前結果：2個測試通過
- 測試覆蓋範圍：僅基礎頁面渲染，業務邏輯幾乎無覆蓋

### CI流程
- GitHub Actions設定存在：`.github/workflows/ci.yml`
- 執行內容：後端測試、前端測試
- 限制：所有測試皆使用記憶體SQLite與FakeRedis，未在真實服務環境執行