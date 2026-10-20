"""Restore AUTO_INCREMENT on every primary key column.

Revision ID: 20261019_autoincrement_pks
Revises: 20261019_supplier_user_link
Create Date: 2026-10-19

Rationale
---------
``20261019_add_mysql_comments_first_schema`` re-declared every ``id`` column
with ``MODIFY COLUMN ... INT NOT NULL COMMENT ...`` but omitted
``AUTO_INCREMENT``, so MySQL silently dropped the attribute on all thirteen
tables. Every insert path then had to pre-compute ``MAX(id) + 1``, which is
unsafe under concurrency and forces application code (including the seeder) to
hand-assign primary keys.

This migration only restores the ``AUTO_INCREMENT`` attribute; column types,
nullability, comments, indexes and data are untouched. It stays fully
backward compatible with the existing ``MAX(id) + 1`` call sites because MySQL
accepts explicit ``id`` values on an AUTO_INCREMENT column.

MySQL refuses to ``MODIFY`` a column that is still referenced by a foreign key
(ERROR 1833), so the referencing constraints are dropped first and recreated
afterwards, mirroring the pattern used by the comments migration.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op

# revision identifiers, used by Alembic.
revision = "20261019_autoincrement_pks"
down_revision = "20261019_supplier_user_link"
branch_labels = None
depends_on = None

# Every primary key column carries the same native comment as before this migration.
PRIMARY_KEY_COMMENTS = {
    "users": "使用者主鍵編號",
    "roles": "角色主鍵編號",
    "permissions": "權限主鍵編號",
    "user_roles": "對應紀錄主鍵",
    "role_permissions": "對應紀錄主鍵",
    "suppliers": "供應商主鍵編號",
    "supplier_qualification_documents": "文件紀錄主鍵",
    "materials": "原物料主鍵",
    "supplier_materials": "對應紀錄主鍵",
    "supplier_lots": "批次主鍵",
    "material_receipts": "收料紀錄主鍵",
    "internal_material_lots": "內部批次主鍵",
    "iqc_records": "檢驗紀錄主鍵",
}

# (table, columns, reference_table, reference_columns, constraint)
FOREIGN_KEYS = (
    ("user_roles", "user_id", "users", "id", "user_roles_ibfk_1"),
    ("user_roles", "role_id", "roles", "id", "user_roles_ibfk_2"),
    ("role_permissions", "role_id", "roles", "id", "role_permissions_ibfk_1"),
    ("role_permissions", "permission_id", "permissions", "id", "role_permissions_ibfk_2"),
    (
        "supplier_qualification_documents",
        "supplier_id",
        "suppliers",
        "id",
        "supplier_qualification_documents_ibfk_1",
    ),
    (
        "supplier_qualification_documents",
        "approved_by_user_id",
        "users",
        "id",
        "supplier_qualification_documents_ibfk_2",
    ),
    ("material_receipts", "supplier_id", "suppliers", "id", "material_receipts_ibfk_1"),
    ("material_receipts", "material_id", "materials", "id", "material_receipts_ibfk_2"),
    ("material_receipts", "supplier_lot_id", "supplier_lots", "id", "material_receipts_ibfk_3"),
    ("material_receipts", "received_by_user_id", "users", "id", "material_receipts_ibfk_4"),
    ("supplier_lots", "supplier_id", "suppliers", "id", "supplier_lots_ibfk_1"),
    ("supplier_lots", "material_id", "materials", "id", "supplier_lots_ibfk_2"),
    ("supplier_materials", "supplier_id", "suppliers", "id", "supplier_materials_ibfk_1"),
    ("supplier_materials", "material_id", "materials", "id", "supplier_materials_ibfk_2"),
    ("internal_material_lots", "material_id", "materials", "id", "internal_material_lots_ibfk_1"),
    (
        "internal_material_lots",
        "supplier_lot_id",
        "supplier_lots",
        "id",
        "internal_material_lots_ibfk_2",
    ),
    (
        "internal_material_lots",
        "receipt_id",
        "material_receipts",
        "id",
        "internal_material_lots_ibfk_3",
    ),
    ("iqc_records", "receipt_id", "material_receipts", "id", "iqc_records_ibfk_1"),
    ("iqc_records", "internal_lot_id", "internal_material_lots", "id", "iqc_records_ibfk_2"),
    ("iqc_records", "inspector_user_id", "users", "id", "iqc_records_ibfk_3"),
    ("iqc_records", "reviewed_by_user_id", "users", "id", "iqc_records_ibfk_4"),
    ("users", "supplier_id", "suppliers", "id", "fk_users_supplier_id"),
)


def _drop_foreign_keys() -> None:
    if context.is_offline_mode():
        for table, _columns, _ref_table, _ref_columns, constraint in FOREIGN_KEYS:
            op.execute(f"ALTER TABLE `{table}` DROP FOREIGN KEY `{constraint}`")
        # Full-head offline rendering follows the review migration before this
        # branch, so the table and these named constraints are present.
        op.execute("ALTER TABLE `quality_reviews` DROP FOREIGN KEY `quality_reviews_ibfk_1`")
        op.execute("ALTER TABLE `quality_reviews` DROP FOREIGN KEY `quality_reviews_ibfk_2`")
    else:
        inspector = sa.inspect(op.get_bind())
        # Constraint names are not stable across MySQL/MariaDB installations.
        # Some existing databases also have already-lost constraints from the
        # earlier comment migration, so drop only constraints that are present.
        for table, columns, ref_table, _ref_columns, _constraint in FOREIGN_KEYS:
            if not inspector.has_table(table):
                continue
            for foreign_key in inspector.get_foreign_keys(table):
                name = foreign_key.get("name")
                if (
                    name
                    and foreign_key.get("constrained_columns") == [columns]
                    and foreign_key.get("referred_table") == ref_table
                ):
                    op.drop_constraint(name, table, type_="foreignkey")

        if inspector.has_table("quality_reviews"):
            for foreign_key in inspector.get_foreign_keys("quality_reviews"):
                name = foreign_key.get("name")
                if name and foreign_key.get("referred_table") in {"iqc_records", "users"}:
                    op.drop_constraint(name, "quality_reviews", type_="foreignkey")


def _add_foreign_keys() -> None:
    for table, columns, ref_table, ref_columns, constraint in FOREIGN_KEYS:
        op.execute(
            f"ALTER TABLE `{table}` ADD CONSTRAINT `{constraint}` "
            f"FOREIGN KEY ({columns}) REFERENCES `{ref_table}` ({ref_columns})"
        )
    if context.is_offline_mode():
        op.create_foreign_key(
            "quality_reviews_ibfk_1",
            "quality_reviews",
            "iqc_records",
            ["iqc_record_id"],
            ["id"],
        )
        op.create_foreign_key(
            "quality_reviews_ibfk_2",
            "quality_reviews",
            "users",
            ["reviewed_by_user_id"],
            ["id"],
        )
    else:
        inspector = sa.inspect(op.get_bind())
        if not inspector.has_table("quality_reviews"):
            return
        op.create_foreign_key(
            "quality_reviews_ibfk_1",
            "quality_reviews",
            "iqc_records",
            ["iqc_record_id"],
            ["id"],
        )
        op.create_foreign_key(
            "quality_reviews_ibfk_2",
            "quality_reviews",
            "users",
            ["reviewed_by_user_id"],
            ["id"],
        )


def _modify_primary_keys(*, auto_increment: bool) -> None:
    attribute = " AUTO_INCREMENT" if auto_increment else ""
    for table, comment in PRIMARY_KEY_COMMENTS.items():
        op.execute(
            f"ALTER TABLE `{table}` MODIFY COLUMN `id` INT NOT NULL{attribute} "
            f"COMMENT '{comment}'"
        )


def upgrade() -> None:
    _drop_foreign_keys()
    _modify_primary_keys(auto_increment=True)
    _add_foreign_keys()


def downgrade() -> None:
    _drop_foreign_keys()
    _modify_primary_keys(auto_increment=False)
    _add_foreign_keys()
