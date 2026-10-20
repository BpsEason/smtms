"""Create persistent supplier document attachment metadata.

Revision ID: 20261019_supplier_document_attachments
Revises: 20261019_quality_review_signoff
Create Date: 2026-10-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261019_doc_attachments"
down_revision = "20261019_merge_qr_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier_document_attachments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="附件主鍵"),
        sa.Column("document_id", sa.Integer(), nullable=False, comment="資格文件主鍵"),
        sa.Column("original_filename", sa.String(length=255), nullable=False, comment="原始檔名"),
        sa.Column("storage_key", sa.String(length=80), nullable=False, comment="安全相對儲存鍵"),
        sa.Column("media_type", sa.String(length=100), nullable=False, comment="驗證後 MIME 類型"),
        sa.Column("size_bytes", sa.Integer(), nullable=False, comment="檔案大小（bytes）"),
        sa.Column("sha256", sa.String(length=64), nullable=False, comment="檔案 SHA-256"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False, comment="建立時間"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["supplier_qualification_documents.id"],
            name="supplier_document_attachments_ibfk_1",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name="uq_supplier_document_attachments_storage_key"),
        comment="供應商資格文件附件 metadata",
    )
    op.create_index(op.f("ix_supplier_document_attachments_id"), "supplier_document_attachments", ["id"], unique=False)
    op.create_index(op.f("ix_supplier_document_attachments_document_id"), "supplier_document_attachments", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_supplier_document_attachments_document_id"), table_name="supplier_document_attachments")
    op.drop_index(op.f("ix_supplier_document_attachments_id"), table_name="supplier_document_attachments")
    op.drop_table("supplier_document_attachments")
