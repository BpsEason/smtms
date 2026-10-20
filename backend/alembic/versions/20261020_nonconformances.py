"""Add nonconformance cases, dispositions, and history."""

import sqlalchemy as sa
from alembic import op

revision = "20261020_nonconformance"
down_revision = "20261019_doc_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nonconformances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_no", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.String(4000), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="open"),
        sa.Column("found_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("found_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id")),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id")),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("material_receipts.id")),
        sa.Column("supplier_lot_id", sa.Integer(), sa.ForeignKey("supplier_lots.id")),
        sa.Column("internal_lot_id", sa.Integer(), sa.ForeignKey("internal_material_lots.id")),
        sa.Column("iqc_record_id", sa.Integer(), sa.ForeignKey("iqc_records.id")),
        sa.Column("defect_qty", sa.DECIMAL(18, 4)),
        sa.Column("investigation", sa.String(4000)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
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
        sa.UniqueConstraint("case_no", name="uq_nonconformances_case_no"),
        comment="品質異常案件",
    )
    for col in (
        "case_no",
        "source",
        "severity",
        "status",
        "supplier_id",
        "material_id",
        "receipt_id",
        "supplier_lot_id",
        "internal_lot_id",
        "iqc_record_id",
    ):
        op.create_index(f"ix_nonconformances_{col}", "nonconformances", [col])
    op.create_table(
        "nonconformance_dispositions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "nonconformance_id",
            sa.Integer(),
            sa.ForeignKey("nonconformances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.String(2000), nullable=False),
        sa.Column("result", sa.String(1000), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        comment="品質異常圍堵與初步處置紀錄",
    )
    op.create_index(
        "ix_nonconformance_dispositions_nonconformance_id",
        "nonconformance_dispositions",
        ["nonconformance_id"],
    )
    op.create_table(
        "nonconformance_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "nonconformance_id",
            sa.Integer(),
            sa.ForeignKey("nonconformances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("before_data", sa.Text()),
        sa.Column("after_data", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        comment="品質異常案件操作歷程",
    )
    op.create_index(
        "ix_nonconformance_history_nonconformance_id",
        "nonconformance_history",
        ["nonconformance_id"],
    )
    op.create_table(
        "nonconformance_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "nonconformance_id",
            sa.Integer(),
            sa.ForeignKey("nonconformances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(80), nullable=False),
        sa.Column("media_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("storage_key", name="uq_nonconformance_attachments_storage_key"),
        comment="品質異常附件 metadata",
    )
    op.create_index(
        "ix_nonconformance_attachments_nonconformance_id",
        "nonconformance_attachments",
        ["nonconformance_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_nonconformance_attachments_nonconformance_id", table_name="nonconformance_attachments"
    )
    op.drop_table("nonconformance_attachments")
    op.drop_index(
        "ix_nonconformance_history_nonconformance_id", table_name="nonconformance_history"
    )
    op.drop_table("nonconformance_history")
    op.drop_index(
        "ix_nonconformance_dispositions_nonconformance_id", table_name="nonconformance_dispositions"
    )
    op.drop_table("nonconformance_dispositions")
    for col in (
        "case_no",
        "source",
        "severity",
        "status",
        "supplier_id",
        "material_id",
        "receipt_id",
        "supplier_lot_id",
        "internal_lot_id",
        "iqc_record_id",
    ):
        op.drop_index(f"ix_nonconformances_{col}", table_name="nonconformances")
    op.drop_table("nonconformances")
