"""Add native MySQL comments to first SMTMS schema tables.

Revision ID: 20261019_add_mysql_comments_first_schema
Revises: 20261019_create_user_auth_tables
Create Date: 2026-10-19
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261019_comments_first_schema"
down_revision = "20261019_create_user_auth_tables"
branch_labels = None
depends_on = None


def _drop_fk(table: str, constraint: str) -> None:
    op.execute(f"ALTER TABLE `{table}` DROP FOREIGN KEY `{constraint}`")


def _add_fk(table: str, columns: str, reference_table: str, reference_columns: str, constraint: str) -> None:
    op.execute(
        f"ALTER TABLE `{table}` ADD CONSTRAINT `{constraint}` "
        f"FOREIGN KEY ({columns}) REFERENCES `{reference_table}` ({reference_columns})"
    )


def upgrade() -> None:
    # Drop dependent foreign keys first so MySQL can safely modify key columns that carry native comments.
    _drop_fk("user_roles", "user_roles_ibfk_1")
    _drop_fk("supplier_qualification_documents", "supplier_qualification_documents_ibfk_2")
    _drop_fk("material_receipts", "material_receipts_ibfk_4")
    _drop_fk("iqc_records", "iqc_records_ibfk_3")

    _drop_fk("user_roles", "user_roles_ibfk_2")
    _drop_fk("role_permissions", "role_permissions_ibfk_1")

    _drop_fk("role_permissions", "role_permissions_ibfk_2")

    _drop_fk("material_receipts", "material_receipts_ibfk_1")
    _drop_fk("supplier_lots", "supplier_lots_ibfk_1")
    _drop_fk("supplier_materials", "supplier_materials_ibfk_1")
    _drop_fk("supplier_qualification_documents", "supplier_qualification_documents_ibfk_1")

    _drop_fk("internal_material_lots", "internal_material_lots_ibfk_1")
    _drop_fk("material_receipts", "material_receipts_ibfk_2")
    _drop_fk("supplier_materials", "supplier_materials_ibfk_2")
    _drop_fk("supplier_lots", "supplier_lots_ibfk_2")

    _drop_fk("material_receipts", "material_receipts_ibfk_3")
    _drop_fk("internal_material_lots", "internal_material_lots_ibfk_2")

    _drop_fk("internal_material_lots", "internal_material_lots_ibfk_3")
    _drop_fk("iqc_records", "iqc_records_ibfk_1")

    _drop_fk("iqc_records", "iqc_records_ibfk_2")

    op.execute("ALTER TABLE `users` COMMENT = '使用者基本資料'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `id` INT NOT NULL COMMENT '使用者主鍵編號'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `username` VARCHAR(80) NOT NULL COMMENT '登入帳號'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(255) NULL COMMENT '聯絡信箱'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `password_hash` VARCHAR(255) NOT NULL COMMENT 'bcrypt 雜湊後密碼'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '帳號是否啟用'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")
    op.execute("ALTER TABLE `users` MODIFY COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間'")

    op.execute("ALTER TABLE `roles` COMMENT = '角色定義'")
    op.execute("ALTER TABLE `roles` MODIFY COLUMN `id` INT NOT NULL COMMENT '角色主鍵編號'")
    op.execute("ALTER TABLE `roles` MODIFY COLUMN `name` VARCHAR(80) NOT NULL COMMENT '角色名稱'")
    op.execute("ALTER TABLE `roles` MODIFY COLUMN `description` VARCHAR(255) NULL COMMENT '角色說明'")
    op.execute("ALTER TABLE `roles` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")
    op.execute("ALTER TABLE `roles` MODIFY COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間'")

    op.execute("ALTER TABLE `permissions` COMMENT = '權限項目定義'")
    op.execute("ALTER TABLE `permissions` MODIFY COLUMN `id` INT NOT NULL COMMENT '權限主鍵編號'")
    op.execute("ALTER TABLE `permissions` MODIFY COLUMN `code` VARCHAR(80) NOT NULL COMMENT '權限代碼'")
    op.execute("ALTER TABLE `permissions` MODIFY COLUMN `name` VARCHAR(120) NOT NULL COMMENT '權限名稱'")
    op.execute("ALTER TABLE `permissions` MODIFY COLUMN `description` VARCHAR(255) NULL COMMENT '權限說明'")
    op.execute("ALTER TABLE `permissions` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")
    op.execute("ALTER TABLE `permissions` MODIFY COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間'")

    op.execute("ALTER TABLE `user_roles` COMMENT = '使用者角色對應表'")
    op.execute("ALTER TABLE `user_roles` MODIFY COLUMN `id` INT NOT NULL COMMENT '對應紀錄主鍵'")
    op.execute("ALTER TABLE `user_roles` MODIFY COLUMN `user_id` INT NOT NULL COMMENT '使用者主鍵'")
    op.execute("ALTER TABLE `user_roles` MODIFY COLUMN `role_id` INT NOT NULL COMMENT '角色主鍵'")
    op.execute("ALTER TABLE `user_roles` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '對應建立時間'")

    op.execute("ALTER TABLE `role_permissions` COMMENT = '角色權限對應表'")
    op.execute("ALTER TABLE `role_permissions` MODIFY COLUMN `id` INT NOT NULL COMMENT '對應紀錄主鍵'")
    op.execute("ALTER TABLE `role_permissions` MODIFY COLUMN `role_id` INT NOT NULL COMMENT '角色主鍵'")
    op.execute("ALTER TABLE `role_permissions` MODIFY COLUMN `permission_id` INT NOT NULL COMMENT '權限主鍵'")
    op.execute("ALTER TABLE `role_permissions` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '對應建立時間'")

    op.execute("ALTER TABLE `suppliers` COMMENT = '供應商基本資料'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `id` INT NOT NULL COMMENT '供應商主鍵編號'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `supplier_code` VARCHAR(80) NOT NULL COMMENT '供應商代碼'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `supplier_name` VARCHAR(200) NOT NULL COMMENT '供應商名稱'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `contact_name` VARCHAR(120) NULL COMMENT '聯絡人姓名'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `phone` VARCHAR(40) NULL COMMENT '聯絡電話'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `email` VARCHAR(160) NULL COMMENT '聯絡信箱'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '供應商狀態'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `address` VARCHAR(255) NULL COMMENT '供應商地址'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `country` VARCHAR(80) NULL COMMENT '供應商所在國家'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")
    op.execute("ALTER TABLE `suppliers` MODIFY COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間'")

    op.execute("ALTER TABLE `supplier_qualification_documents` COMMENT = '供應商資格文件紀錄'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `id` INT NOT NULL COMMENT '文件紀錄主鍵'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `supplier_id` INT NOT NULL COMMENT '對應供應商主鍵'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `doc_type` VARCHAR(50) NOT NULL COMMENT '文件類型'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `doc_code` VARCHAR(80) NULL COMMENT '文件編號'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `doc_name` VARCHAR(200) NOT NULL COMMENT '文件名稱'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `file_path` VARCHAR(255) NULL COMMENT '文件存放路徑'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `issued_at` DATETIME NULL COMMENT '發證日期'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `expires_at` DATETIME NULL COMMENT '到期日期'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `approved_by_user_id` INT NULL COMMENT '審核人員主鍵'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '文件狀態'")
    op.execute("ALTER TABLE `supplier_qualification_documents` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")

    op.execute("ALTER TABLE `materials` COMMENT = '原物料主檔'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `id` INT NOT NULL COMMENT '原物料主鍵'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `material_code` VARCHAR(80) NOT NULL COMMENT '原物料代碼'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `material_name` VARCHAR(200) NOT NULL COMMENT '原物料名稱'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `material_type` VARCHAR(50) NOT NULL COMMENT '物料類型'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `spec` VARCHAR(255) NULL COMMENT '規格說明'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `uom` VARCHAR(30) NOT NULL COMMENT '計量單位'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '物料狀態'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")
    op.execute("ALTER TABLE `materials` MODIFY COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新時間'")

    op.execute("ALTER TABLE `supplier_materials` COMMENT = '供應商原物料對應表'")
    op.execute("ALTER TABLE `supplier_materials` MODIFY COLUMN `id` INT NOT NULL COMMENT '對應紀錄主鍵'")
    op.execute("ALTER TABLE `supplier_materials` MODIFY COLUMN `supplier_id` INT NOT NULL COMMENT '供應商主鍵'")
    op.execute("ALTER TABLE `supplier_materials` MODIFY COLUMN `material_id` INT NOT NULL COMMENT '原物料主鍵'")
    op.execute("ALTER TABLE `supplier_materials` MODIFY COLUMN `supplier_material_code` VARCHAR(80) NULL COMMENT '供應商料號'")
    op.execute("ALTER TABLE `supplier_materials` MODIFY COLUMN `is_preferred` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否為首選供應商'")
    op.execute("ALTER TABLE `supplier_materials` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")

    op.execute("ALTER TABLE `supplier_lots` COMMENT = '供應商批次資料'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `id` INT NOT NULL COMMENT '批次主鍵'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `supplier_id` INT NOT NULL COMMENT '供應商主鍵'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `material_id` INT NOT NULL COMMENT '原物料主鍵'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `supplier_lot_no` VARCHAR(120) NOT NULL COMMENT '供應商批號'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `manufacturing_date` DATETIME NULL COMMENT '製造日期'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `expiry_date` DATETIME NULL COMMENT '有效日期'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `qty_received` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '收貨數量'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `uom` VARCHAR(30) NOT NULL COMMENT '批次計量單位'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `qc_status` VARCHAR(20) NOT NULL DEFAULT 'received' COMMENT '品質狀態'")
    op.execute("ALTER TABLE `supplier_lots` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")

    op.execute("ALTER TABLE `material_receipts` COMMENT = '原物料收料紀錄'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `id` INT NOT NULL COMMENT '收料紀錄主鍵'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `supplier_id` INT NOT NULL COMMENT '供應商主鍵'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `material_id` INT NOT NULL COMMENT '原物料主鍵'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `supplier_lot_id` INT NOT NULL COMMENT '供應商批次主鍵'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `receipt_no` VARCHAR(80) NOT NULL COMMENT '收料單號'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `received_at` DATETIME NOT NULL COMMENT '收料時間'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `received_by_user_id` INT NULL COMMENT '收料人員主鍵'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `qty_received` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '實際收料數量'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `qty_remaining` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '剩餘可用數量'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'received' COMMENT '收料狀態'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `notes` VARCHAR(500) NULL COMMENT '收料備註'")
    op.execute("ALTER TABLE `material_receipts` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")

    op.execute("ALTER TABLE `internal_material_lots` COMMENT = '內部物料批次庫存'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `id` INT NOT NULL COMMENT '內部批次主鍵'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `material_id` INT NOT NULL COMMENT '原物料主鍵'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `supplier_lot_id` INT NULL COMMENT '來源供應商批次主鍵'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `receipt_id` INT NULL COMMENT '來源收料紀錄主鍵'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `internal_lot_no` VARCHAR(120) NOT NULL COMMENT '內部批號'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `qty_on_hand` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '現有庫存量'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `qty_reserved` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '預留庫存量'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `uom` VARCHAR(30) NOT NULL COMMENT '庫存計量單位'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `lot_status` VARCHAR(20) NOT NULL DEFAULT 'available' COMMENT '批次狀態'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `expiry_date` DATETIME NULL COMMENT '批次有效日期'")
    op.execute("ALTER TABLE `internal_material_lots` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")

    op.execute("ALTER TABLE `iqc_records` COMMENT = '來料檢驗紀錄'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `id` INT NOT NULL COMMENT '檢驗紀錄主鍵'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `receipt_id` INT NULL COMMENT '關聯收料紀錄主鍵'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `internal_lot_id` INT NULL COMMENT '關聯內部批次主鍵'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `inspector_user_id` INT NULL COMMENT '檢驗人員主鍵'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `sample_qty` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '抽樣數量'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `inspection_result` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '檢驗結果'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `inspection_date` DATETIME NULL COMMENT '檢驗日期'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `release_status` VARCHAR(20) NOT NULL DEFAULT 'hold' COMMENT '放行狀態'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `remarks` VARCHAR(500) NULL COMMENT '檢驗備註'")
    op.execute("ALTER TABLE `iqc_records` MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間'")

    _add_fk("user_roles", "user_id", "users", "id", "user_roles_ibfk_1")
    _add_fk("user_roles", "role_id", "roles", "id", "user_roles_ibfk_2")
    _add_fk("role_permissions", "role_id", "roles", "id", "role_permissions_ibfk_1")
    _add_fk("role_permissions", "permission_id", "permissions", "id", "role_permissions_ibfk_2")
    _add_fk("supplier_qualification_documents", "supplier_id", "suppliers", "id", "supplier_qualification_documents_ibfk_1")
    _add_fk("supplier_qualification_documents", "approved_by_user_id", "users", "id", "supplier_qualification_documents_ibfk_2")
    _add_fk("material_receipts", "supplier_id", "suppliers", "id", "material_receipts_ibfk_1")
    _add_fk("material_receipts", "material_id", "materials", "id", "material_receipts_ibfk_2")
    _add_fk("material_receipts", "supplier_lot_id", "supplier_lots", "id", "material_receipts_ibfk_3")
    _add_fk("material_receipts", "received_by_user_id", "users", "id", "material_receipts_ibfk_4")
    _add_fk("supplier_lots", "supplier_id", "suppliers", "id", "supplier_lots_ibfk_1")
    _add_fk("supplier_lots", "material_id", "materials", "id", "supplier_lots_ibfk_2")
    _add_fk("supplier_materials", "supplier_id", "suppliers", "id", "supplier_materials_ibfk_1")
    _add_fk("supplier_materials", "material_id", "materials", "id", "supplier_materials_ibfk_2")
    _add_fk("internal_material_lots", "material_id", "materials", "id", "internal_material_lots_ibfk_1")
    _add_fk("internal_material_lots", "supplier_lot_id", "supplier_lots", "id", "internal_material_lots_ibfk_2")
    _add_fk("internal_material_lots", "receipt_id", "material_receipts", "id", "internal_material_lots_ibfk_3")
    _add_fk("iqc_records", "receipt_id", "material_receipts", "id", "iqc_records_ibfk_1")
    _add_fk("iqc_records", "internal_lot_id", "internal_material_lots", "id", "iqc_records_ibfk_2")
    _add_fk("iqc_records", "inspector_user_id", "users", "id", "iqc_records_ibfk_3")


def downgrade() -> None:
    tables = [
        "iqc_records",
        "internal_material_lots",
        "material_receipts",
        "supplier_lots",
        "supplier_materials",
        "materials",
        "supplier_qualification_documents",
        "suppliers",
        "role_permissions",
        "user_roles",
        "permissions",
        "roles",
        "users",
    ]
    for table in tables:
        op.execute(f"ALTER TABLE `{table}` COMMENT = ''")
