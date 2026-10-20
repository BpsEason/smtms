"""Add QA review status fields and historical review records.

Revision ID: 20261019_quality_review_signoff
Revises: 20261019_supplier_user_link
Create Date: 2026-10-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261019_quality_review_signoff"
down_revision = "20261019_supplier_user_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "iqc_records",
        sa.Column(
            "review_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
            comment="品保審核狀態",
        ),
    )
    op.add_column(
        "iqc_records",
        sa.Column(
            "reviewed_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
            comment="最後審核人員主鍵",
        ),
    )
    op.add_column(
        "iqc_records",
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="最後審核時間",
        ),
    )
    op.add_column(
        "iqc_records",
        sa.Column(
            "review_decision_note",
            sa.String(length=500),
            nullable=True,
            comment="審核結論備註",
        ),
    )
    op.create_index(
        op.f("ix_iqc_records_review_status"), "iqc_records", ["review_status"], unique=False
    )
    op.create_index(
        op.f("ix_iqc_records_reviewed_by_user_id"),
        "iqc_records",
        ["reviewed_by_user_id"],
        unique=False,
    )

    op.create_table(
        "quality_reviews",
        sa.Column("id", sa.Integer(), nullable=False, comment="審核紀錄主鍵"),
        sa.Column("iqc_record_id", sa.Integer(), nullable=False, comment="關聯檢驗紀錄主鍵"),
        sa.Column(
            "review_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
            comment="審核狀態：pending/approved/returned",
        ),
        sa.Column(
            "decision",
            sa.String(length=20),
            nullable=False,
            server_default="approved",
            comment="審核決策",
        ),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True, comment="審核人員主鍵"),
        sa.Column("decision_note", sa.String(length=500), nullable=True, comment="審核意見"),
        sa.Column("reason", sa.String(length=500), nullable=True, comment="退回原因或補件說明"),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True, comment="審核時間"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
            comment="建立時間",
        ),
        sa.ForeignKeyConstraint(
            ["iqc_record_id"], ["iqc_records.id"], name="quality_reviews_ibfk_1"
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"], ["users.id"], name="quality_reviews_ibfk_2"
        ),
        sa.PrimaryKeyConstraint("id"),
        comment="品保審核歷程",
    )
    op.create_index(op.f("ix_quality_reviews_id"), "quality_reviews", ["id"], unique=False)
    op.create_index(
        op.f("ix_quality_reviews_iqc_record_id"), "quality_reviews", ["iqc_record_id"], unique=False
    )
    op.create_index(
        op.f("ix_quality_reviews_review_status"), "quality_reviews", ["review_status"], unique=False
    )
    op.create_index(
        op.f("ix_quality_reviews_reviewed_by_user_id"),
        "quality_reviews",
        ["reviewed_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_quality_reviews_reviewed_by_user_id"), table_name="quality_reviews")
    op.drop_index(op.f("ix_quality_reviews_review_status"), table_name="quality_reviews")
    op.drop_index(op.f("ix_quality_reviews_iqc_record_id"), table_name="quality_reviews")
    op.drop_index(op.f("ix_quality_reviews_id"), table_name="quality_reviews")
    op.drop_table("quality_reviews")
    op.drop_index(op.f("ix_iqc_records_reviewed_by_user_id"), table_name="iqc_records")
    op.drop_index(op.f("ix_iqc_records_review_status"), table_name="iqc_records")
    op.drop_column("iqc_records", "review_decision_note")
    op.drop_column("iqc_records", "reviewed_at")
    op.drop_column("iqc_records", "reviewed_by_user_id")
    op.drop_column("iqc_records", "review_status")
