# SMTMS - Database Schema (資料庫結構)

## 文件資訊
- 版本：1.0.1
- 最後更新：2026-10-28
- 資料庫：MySQL 8.x
- 相關文件：[API契約](./04_API_CONTRACT.md), [領域規則](./02_DOMAIN_RULES.md)

---

## 實體關係圖 (ERD 摘要)
```
users ──┐
        ├─ user_roles ── roles ── role_permissions ── permissions
        └─ iqc_records (inspector_user_id)
        └─ nonconformances (reported_by_user_id)

suppliers ──┐
            ├─ supplier_materials ── materials
            ├─ supplier_qualification_documents ── supplier_document_attachments
            └─ supplier_lots ── material_receipts ── internal_material_lots ── iqc_records
                                                                    └─ quality_reviews
                                                         internal_material_lots ── nonconformances
                                                                                       ├─ nonconformance_dispositions
                                                                                       ├─ nonconformance_history
                                                                                       └─ nonconformance_attachments
```

---

## 使用者權限相關資料表

### users (使用者)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | 主鍵 |
| email | VARCHAR(255) | ❌ | UNIQUE | 登入帳號 |
| hashed_password | VARCHAR(255) | ❌ | - | 加密密碼 |
| full_name | VARCHAR(255) | ❌ | - | 使用者全名 |
| is_active | BOOLEAN | ❌ | true | 是否啟用 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |
| updated_at | DATETIME | ✅ | NULL | 更新時間 |

### roles (角色)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| name | VARCHAR(100) | ❌ | UNIQUE | 角色名稱 |
| description | TEXT | ✅ | NULL | 描述 |

### permissions (權限)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| permission_code | VARCHAR(100) | ❌ | UNIQUE | 權限代碼，如`suppliers:read` |
| description | TEXT | ✅ | NULL | 說明 |

### user_roles (使用者角色關聯)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| user_id | INT | ❌ | PK, FK(users.id) | |
| role_id | INT | ❌ | PK, FK(roles.id) | |

### role_permissions (角色權限關聯)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| role_id | INT | ❌ | PK, FK(roles.id) | |
| permission_id | INT | ❌ | PK, FK(permissions.id) | |

---

## 供應商與物料主檔

### suppliers (供應商)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| supplier_code | VARCHAR(50) | ❌ | UNIQUE | 供應商代碼，[DR-001](./02_DOMAIN_RULES.md#dr-001供應商代碼唯一性) |
| supplier_name | VARCHAR(255) | ❌ | - | 供應商名稱 |
| contact_person | VARCHAR(100) | ✅ | NULL | 聯絡人 |
| contact_email | VARCHAR(255) | ✅ | NULL | 聯絡信箱 |
| contact_phone | VARCHAR(50) | ✅ | NULL | 聯絡電話 |
| address | TEXT | ✅ | NULL | 地址 |
| is_active | BOOLEAN | ❌ | true | 是否啟用 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |
| updated_at | DATETIME | ✅ | NULL | |

### materials (物料)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| material_code | VARCHAR(50) | ❌ | UNIQUE | 物料代碼，[DR-002](./02_DOMAIN_RULES.md#dr-002物料代碼唯一性) |
| material_name | VARCHAR(255) | ❌ | - | 物料名稱 |
| specification | TEXT | ✅ | NULL | 規格 |
| unit_of_measure | VARCHAR(20) | ❌ | - | 單位，如PCS、KG |
| is_active | BOOLEAN | ❌ | true | 是否啟用 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |
| updated_at | DATETIME | ✅ | NULL | |

### supplier_materials (供應商-物料供貨關聯)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| supplier_id | INT | ❌ | PK, FK(suppliers.id) | [DR-003](./02_DOMAIN_RULES.md#dr-003供貨關聯唯一性) |
| material_id | INT | ❌ | PK, FK(materials.id) | |
| is_preferred | BOOLEAN | ❌ | false | 是否為首選供應商，[DR-004](./02_DOMAIN_RULES.md#dr-004首選供應商唯一性) |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

### supplier_qualification_documents (供應商資格文件)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| supplier_id | INT | ❌ | FK(suppliers.id) | |
| document_type | VARCHAR(100) | ❌ | - | 文件類型 |
| document_number | VARCHAR(100) | ✅ | NULL | 文件編號 |
| issue_date | DATE | ✅ | NULL | 核發日期 |
| expiry_date | DATE | ✅ | NULL | 有效期限 |
| file_path | VARCHAR(500) | ✅ | NULL | 檔案路徑（目前僅為字串，實體檔案不存在） |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

### supplier_document_attachments (供應商資格文件附件 metadata)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| document_id | INT | ❌ | FK(supplier_qualification_documents.id), INDEX | 文件關聯，刪除文件時級聯刪除 |
| original_filename | VARCHAR(255) | ❌ | - | 原始檔名 |
| storage_key | VARCHAR(80) | ❌ | - | 安全相對儲存鍵，唯一 |
| media_type | VARCHAR(100) | ❌ | - | 驗證後 MIME 類型 |
| size_bytes | INT | ❌ | - | 檔案大小 |
| sha256 | VARCHAR(64) | ❌ | - | SHA-256 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

---

## 批次與追溯相關資料表

### supplier_lots (供應商出廠批次)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| supplier_lot_no | VARCHAR(100) | ❌ | UNIQUE | 供應商批次號 |
| supplier_id | INT | ❌ | FK(suppliers.id) | 供應商 |
| material_id | INT | ❌ | FK(materials.id) | 物料 |
| qty_supplied | DECIMAL(18,4) | ❌ | - | 出廠數量 |
| production_date | DATE | ✅ | NULL | 生產日期 |
| qc_status | VARCHAR(50) | ✅ | NULL | 出廠品質狀態，TBD：狀態流轉邏輯 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

### material_receipts (廠內收料單)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| receipt_no | VARCHAR(50) | ❌ | UNIQUE | 收料單號 |
| supplier_lot_id | INT | ❌ | FK(supplier_lots.id) | 對應的供應商批次，[DR-009](./02_DOMAIN_RULES.md#dr-009追溯鏈關聯一致性) |
| qty_received | DECIMAL(18,4) | ❌ | - | 收料數量，[DR-005](./02_DOMAIN_RULES.md#dr-005收料數量必須正數) |
| qty_remaining | DECIMAL(18,4) | ❌ | - | 剩餘可拆分數量，[DR-006](./02_DOMAIN_RULES.md#dr-006拆分數量限制) |
| receipt_date | DATETIME | ❌ | - | 收料時間 |
| received_by_user_id | INT | ❌ | FK(users.id) | 收料人員 |
| status | VARCHAR(50) | ✅ | NULL | 收料單狀態，TBD：狀態流轉邏輯 |
| notes | TEXT | ✅ | NULL | 備註 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

### internal_material_lots (內部物料批次)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| internal_lot_no | VARCHAR(100) | ❌ | UNIQUE | 內部批次號，[DR-007](./02_DOMAIN_RULES.md#dr-007內部批次編號唯一性) |
| material_receipt_id | INT | ❌ | FK(material_receipts.id) | 所屬收料單 |
| qty_initial | DECIMAL(18,4) | ❌ | - | 初始數量 |
| qty_on_hand | DECIMAL(18,4) | ❌ | - | 現有庫存數量 |
| lot_status | VARCHAR(50) | ❌ | 'quarantined' | 批次狀態，[DR-013](./02_DOMAIN_RULES.md#dr-013內部批次狀態流轉) |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

---

## 品質管理相關資料表

### audit_logs (唯讀系統稽核紀錄)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| actor_user_id | INT | ✅ | NULL | 操作者使用者 ID；系統事件可為 NULL |
| action | VARCHAR(20) | ❌ | - | 操作類型，如 CREATE、UPDATE、DELETE、LOGIN |
| resource_type | VARCHAR(100) | ❌ | - | 資源類型 |
| resource_id | VARCHAR(100) | ✅ | NULL | 資源識別值 |
| before_data | JSON | ✅ | NULL | 異動前資料（敏感欄位已遮蔽） |
| after_data | JSON | ✅ | NULL | 異動後資料（敏感欄位已遮蔽） |
| request_id | VARCHAR(100) | ✅ | NULL | 請求識別碼；目前無 Request ID middleware，通常為 NULL |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | 操作時間 |

索引：`actor_user_id`、`(resource_type, resource_id)`、`(actor_user_id, created_at)`、`(action, created_at)`。稽核紀錄透過業務交易一起提交，應用程式僅提供唯讀查詢；表格及 `audit:read` 權限由 `20261021_audit_logs` migration 建立。

### iqc_records (進料檢驗記錄)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| internal_lot_id | INT | ❌ | FK(internal_material_lots.id) | 檢驗的內部批次 |
| inspection_date | DATETIME | ❌ | - | 檢驗時間 |
| inspector_user_id | INT | ❌ | FK(users.id) | 檢驗人員，[DR-012](./02_DOMAIN_RULES.md#dr-012iqc檢驗人自動綁定) |
| inspection_result | VARCHAR(50) | ❌ | - | 檢驗結果：pending/passed/failed |
| release_status | VARCHAR(50) | ❌ | - | 放行狀態：hold/released/rejected/quarantined，[DR-008](./02_DOMAIN_RULES.md#dr-008iqc結果與放行狀態配對) |
| inspection_notes | TEXT | ✅ | NULL | 檢驗備註 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |
| updated_at | DATETIME | ✅ | NULL | |

### nonconformances (不合格品記錄)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| case_no | VARCHAR(40) | ❌ | UNIQUE | 案件編號 |
| title / description | VARCHAR(200) / VARCHAR(4000) | ❌ | - | 標題及描述 |
| source / severity / status | VARCHAR(30) / VARCHAR(20) / VARCHAR(30) | ❌ | status=`open` | 來源、嚴重程度及處理狀態 |
| found_at | DATETIME | ❌ | - | 發現時間 |
| found_by_user_id | INT | ❌ | FK(users.id) | 通報人 |
| owner_user_id | INT | ✅ | FK(users.id) | 負責人 |
| supplier_id / material_id | INT | ✅ | 對應 FK | 關聯供應商／物料 |
| receipt_id / supplier_lot_id | INT | ✅ | 對應 FK | 關聯收料／供應商批次 |
| internal_lot_id / iqc_record_id | INT | ✅ | 對應 FK | 關聯內部批次／IQC |
| defect_qty | DECIMAL(18,4) | ✅ | NULL | 不良數量 |
| investigation | VARCHAR(4000) | ✅ | NULL | 調查內容 |
| closed_at | DATETIME | ✅ | NULL | 結案時間 |
| created_at / updated_at | DATETIME | ❌ | CURRENT_TIMESTAMP | 建立／更新時間 |

### quality_reviews (IQC 品保審核歷程)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| iqc_record_id | INT | ❌ | FK(iqc_records.id), INDEX | 關聯檢驗紀錄 |
| review_status | VARCHAR(20) | ❌ | `pending` | pending/approved/returned |
| decision | VARCHAR(20) | ❌ | `approved` | 審核決策 |
| reviewed_by_user_id | INT | ✅ | FK(users.id) | 審核人員 |
| decision_note / reason | VARCHAR(500) | ✅ | NULL | 審核意見／退回原因 |
| reviewed_at | DATETIME | ✅ | NULL | 審核時間 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

### nonconformance_dispositions (品質異常初步處置紀錄)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| nonconformance_id | INT | ❌ | FK(nonconformances.id), INDEX | 刪除案件時級聯刪除 |
| content / result | VARCHAR(2000) / VARCHAR(1000) | ❌ | - | 處置內容及結果 |
| owner_user_id / created_by_user_id | INT | ❌ | FK(users.id) | 負責人及建立者 |
| executed_at / created_at | DATETIME | ❌ | - / CURRENT_TIMESTAMP | 執行／建立時間 |

### nonconformance_history (品質異常案件歷程)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| nonconformance_id | INT | ❌ | FK(nonconformances.id), INDEX | 刪除案件時級聯刪除 |
| actor_user_id | INT | ❌ | FK(users.id) | 操作者 |
| action | VARCHAR(40) | ❌ | - | 操作類型 |
| before_data | TEXT | ✅ | NULL | 異動前資料 |
| after_data | TEXT | ❌ | - | 異動後資料 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

### nonconformance_attachments (品質異常附件 metadata)
| 欄位名稱 | 型態 | 可空 | 預設 | 說明 |
|---------|------|------|------|------|
| id | INT | ❌ | PK | |
| nonconformance_id | INT | ❌ | FK(nonconformances.id), INDEX | 刪除案件時級聯刪除 |
| original_filename | VARCHAR(255) | ❌ | - | 原始檔名 |
| storage_key | VARCHAR(80) | ❌ | - | 安全相對儲存鍵，唯一 |
| media_type | VARCHAR(100) | ❌ | - | 驗證後 MIME 類型 |
| size_bytes | INT | ❌ | - | 檔案大小 |
| sha256 | VARCHAR(64) | ❌ | - | SHA-256 |
| created_by_user_id | INT | ❌ | FK(users.id) | 建立者 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

---

## 資料庫遷移
- 遷移工具：Alembic
- 遷移檔案位置：`backend/alembic/versions/`
- Audit Log 遷移：`20261021_audit_logs.py`（revision `20261021_audit_logs`，前置 revision `20261021_nc_permissions`）