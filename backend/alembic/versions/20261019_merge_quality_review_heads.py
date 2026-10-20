"""Merge the auto-increment and QA review migration branches.

Revision ID: 20261019_merge_quality_review_heads
Revises: 20261019_autoincrement_pks, 20261019_quality_review_signoff
Create Date: 2026-10-19
"""

revision = "20261019_merge_qr_heads"
down_revision = ("20261019_autoincrement_pks", "20261019_quality_review_signoff")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
