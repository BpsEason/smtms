"""Create first SMTMS schema batch for RBAC and supplier-quality tracking.

Revision ID: 20261019_create_user_auth_tables
Revises:
Create Date: 2026-10-19 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261019_create_user_auth_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )
    op.create_index(op.f("ix_roles_id"), "roles", ["id"], unique=False)
    op.create_index(op.f("ix_roles_name"), "roles", ["name"], unique=True)

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("code", name="uq_permissions_code"),
    )
    op.create_index(op.f("ix_permissions_code"), "permissions", ["code"], unique=True)
    op.create_index(op.f("ix_permissions_id"), "permissions", ["id"], unique=False)
    op.create_index(op.f("ix_permissions_name"), "permissions", ["name"], unique=False)

    op.create_table(
        "user_roles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )
    op.create_index(op.f("ix_user_roles_id"), "user_roles", ["id"], unique=False)
    op.create_index(op.f("ix_user_roles_role_id"), "user_roles", ["role_id"], unique=False)
    op.create_index(op.f("ix_user_roles_user_id"), "user_roles", ["user_id"], unique=False)

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
    )
    op.create_index(op.f("ix_role_permissions_id"), "role_permissions", ["id"], unique=False)
    op.create_index(
        op.f("ix_role_permissions_permission_id"),
        "role_permissions",
        ["permission_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_role_permissions_role_id"), "role_permissions", ["role_id"], unique=False
    )

    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("supplier_code", sa.String(length=80), nullable=False),
        sa.Column("supplier_name", sa.String(length=200), nullable=False),
        sa.Column("contact_name", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("email", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("country", sa.String(length=80), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("supplier_code", name="uq_suppliers_supplier_code"),
    )
    op.create_index(op.f("ix_suppliers_id"), "suppliers", ["id"], unique=False)
    op.create_index(op.f("ix_suppliers_supplier_code"), "suppliers", ["supplier_code"], unique=True)
    op.create_index(
        op.f("ix_suppliers_supplier_name"), "suppliers", ["supplier_name"], unique=False
    )
    op.create_index(op.f("ix_suppliers_status"), "suppliers", ["status"], unique=False)

    op.create_table(
        "supplier_qualification_documents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("doc_type", sa.String(length=50), nullable=False),
        sa.Column("doc_code", sa.String(length=80), nullable=True),
        sa.Column("doc_name", sa.String(length=200), nullable=False),
        sa.Column("file_path", sa.String(length=255), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_supplier_qualification_documents_approved_by_user_id"),
        "supplier_qualification_documents",
        ["approved_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_supplier_qualification_documents_doc_type"),
        "supplier_qualification_documents",
        ["doc_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_supplier_qualification_documents_id"),
        "supplier_qualification_documents",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_supplier_qualification_documents_status"),
        "supplier_qualification_documents",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_supplier_qualification_documents_supplier_id"),
        "supplier_qualification_documents",
        ["supplier_id"],
        unique=False,
    )

    op.create_table(
        "materials",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("material_code", sa.String(length=80), nullable=False),
        sa.Column("material_name", sa.String(length=200), nullable=False),
        sa.Column("material_type", sa.String(length=50), nullable=False),
        sa.Column("spec", sa.String(length=255), nullable=True),
        sa.Column("uom", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("material_code", name="uq_materials_material_code"),
    )
    op.create_index(op.f("ix_materials_id"), "materials", ["id"], unique=False)
    op.create_index(op.f("ix_materials_material_code"), "materials", ["material_code"], unique=True)
    op.create_index(
        op.f("ix_materials_material_name"), "materials", ["material_name"], unique=False
    )
    op.create_index(op.f("ix_materials_status"), "materials", ["status"], unique=False)

    op.create_table(
        "supplier_materials",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
        sa.Column("supplier_material_code", sa.String(length=80), nullable=True),
        sa.Column("is_preferred", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "supplier_id", "material_id", name="uq_supplier_materials_supplier_material"
        ),
    )
    op.create_index(op.f("ix_supplier_materials_id"), "supplier_materials", ["id"], unique=False)
    op.create_index(
        op.f("ix_supplier_materials_material_id"),
        "supplier_materials",
        ["material_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_supplier_materials_supplier_id"),
        "supplier_materials",
        ["supplier_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_supplier_materials_supplier_material_code"),
        "supplier_materials",
        ["supplier_material_code"],
        unique=False,
    )

    op.create_table(
        "supplier_lots",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
        sa.Column("supplier_lot_no", sa.String(length=120), nullable=False),
        sa.Column("manufacturing_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "qty_received", sa.DECIMAL(precision=18, scale=4), nullable=False, server_default="0"
        ),
        sa.Column("uom", sa.String(length=30), nullable=False),
        sa.Column("qc_status", sa.String(length=20), nullable=False, server_default="received"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "supplier_id",
            "material_id",
            "supplier_lot_no",
            name="uq_supplier_lots_supplier_material_lot",
        ),
    )
    op.create_index(op.f("ix_supplier_lots_id"), "supplier_lots", ["id"], unique=False)
    op.create_index(
        op.f("ix_supplier_lots_material_id"), "supplier_lots", ["material_id"], unique=False
    )
    op.create_index(
        op.f("ix_supplier_lots_qc_status"), "supplier_lots", ["qc_status"], unique=False
    )
    op.create_index(
        op.f("ix_supplier_lots_supplier_id"), "supplier_lots", ["supplier_id"], unique=False
    )
    op.create_index(
        op.f("ix_supplier_lots_supplier_lot_no"), "supplier_lots", ["supplier_lot_no"], unique=False
    )

    op.create_table(
        "material_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
        sa.Column(
            "supplier_lot_id", sa.Integer(), sa.ForeignKey("supplier_lots.id"), nullable=False
        ),
        sa.Column("receipt_no", sa.String(length=80), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "qty_received", sa.DECIMAL(precision=18, scale=4), nullable=False, server_default="0"
        ),
        sa.Column(
            "qty_remaining", sa.DECIMAL(precision=18, scale=4), nullable=False, server_default="0"
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="received"),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("receipt_no", name="uq_material_receipts_receipt_no"),
    )
    op.create_index(op.f("ix_material_receipts_id"), "material_receipts", ["id"], unique=False)
    op.create_index(
        op.f("ix_material_receipts_material_id"), "material_receipts", ["material_id"], unique=False
    )
    op.create_index(
        op.f("ix_material_receipts_received_at"), "material_receipts", ["received_at"], unique=False
    )
    op.create_index(
        op.f("ix_material_receipts_received_by_user_id"),
        "material_receipts",
        ["received_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_material_receipts_receipt_no"), "material_receipts", ["receipt_no"], unique=True
    )
    op.create_index(
        op.f("ix_material_receipts_status"), "material_receipts", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_material_receipts_supplier_id"), "material_receipts", ["supplier_id"], unique=False
    )

    op.create_table(
        "internal_material_lots",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
        sa.Column(
            "supplier_lot_id", sa.Integer(), sa.ForeignKey("supplier_lots.id"), nullable=True
        ),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("material_receipts.id"), nullable=True),
        sa.Column("internal_lot_no", sa.String(length=120), nullable=False),
        sa.Column(
            "qty_on_hand", sa.DECIMAL(precision=18, scale=4), nullable=False, server_default="0"
        ),
        sa.Column(
            "qty_reserved", sa.DECIMAL(precision=18, scale=4), nullable=False, server_default="0"
        ),
        sa.Column("uom", sa.String(length=30), nullable=False),
        sa.Column("lot_status", sa.String(length=20), nullable=False, server_default="available"),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "material_id", "internal_lot_no", name="uq_internal_material_lots_material_internal_lot"
        ),
    )
    op.create_index(
        op.f("ix_internal_material_lots_id"), "internal_material_lots", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_internal_material_lots_internal_lot_no"),
        "internal_material_lots",
        ["internal_lot_no"],
        unique=False,
    )
    op.create_index(
        op.f("ix_internal_material_lots_lot_status"),
        "internal_material_lots",
        ["lot_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_internal_material_lots_material_id"),
        "internal_material_lots",
        ["material_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_internal_material_lots_receipt_id"),
        "internal_material_lots",
        ["receipt_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_internal_material_lots_supplier_lot_id"),
        "internal_material_lots",
        ["supplier_lot_id"],
        unique=False,
    )

    op.create_table(
        "iqc_records",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("material_receipts.id"), nullable=True),
        sa.Column(
            "internal_lot_id",
            sa.Integer(),
            sa.ForeignKey("internal_material_lots.id"),
            nullable=True,
        ),
        sa.Column("inspector_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "sample_qty", sa.DECIMAL(precision=18, scale=4), nullable=False, server_default="0"
        ),
        sa.Column(
            "inspection_result", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column("inspection_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("release_status", sa.String(length=20), nullable=False, server_default="hold"),
        sa.Column("remarks", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_iqc_records_id"), "iqc_records", ["id"], unique=False)
    op.create_index(
        op.f("ix_iqc_records_inspection_result"), "iqc_records", ["inspection_result"], unique=False
    )
    op.create_index(
        op.f("ix_iqc_records_internal_lot_id"), "iqc_records", ["internal_lot_id"], unique=False
    )
    op.create_index(op.f("ix_iqc_records_receipt_id"), "iqc_records", ["receipt_id"], unique=False)
    op.create_index(
        op.f("ix_iqc_records_release_status"), "iqc_records", ["release_status"], unique=False
    )


def downgrade() -> None:
    op.drop_table("iqc_records")
    op.drop_table("internal_material_lots")
    op.drop_table("material_receipts")
    op.drop_table("supplier_lots")
    op.drop_table("supplier_materials")
    op.drop_table("materials")
    op.drop_table("supplier_qualification_documents")
    op.drop_table("suppliers")
    op.drop_table("role_permissions")
    op.drop_table("user_roles")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("users")
