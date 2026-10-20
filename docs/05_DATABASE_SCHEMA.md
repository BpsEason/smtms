# SMTMS - Database Schema (資料庫結構)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-20
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
            ├─ supplier_qualification_documents
            └─ supplier_lots ── material_receipts ── internal_material_lots ── iqc_records
                                                         internal_material_lots ── nonconformances
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
| internal_lot_id | INT | ❌ | FK(internal_material_lots.id) | 對應的內部批次 |
| nc_number | VARCHAR(50) | ❌ | UNIQUE | 異常單號 |
| issue_description | TEXT | ❌ | - | 問題描述 |
| reported_by_user_id | INT | ❌ | FK(users.id) | 通報人 |
| current_status | VARCHAR(50) | ❌ | 'open' | 處理狀態 |
| resolution | TEXT | ✅ | NULL | 處理結果 |
| resolved_at | DATETIME | ✅ | NULL | 處理完成時間 |
| created_at | DATETIME | ❌ | CURRENT_TIMESTAMP | |

---

## 資料庫遷移
- 遷移工具：Alembic
- 遷移檔案位置：`backend/alembic/versions/`
- 最新遷移：`20261019_add_mysql_comments_first_schema.py`