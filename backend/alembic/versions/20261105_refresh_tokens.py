"""Create refresh_tokens table for Refresh Token persistence.

Revision ID: 20261105_refresh_tokens
Revises: 20261104_internal_lot_unique
Create Date: 2026-11-05 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261105_refresh_tokens"
down_revision = "20261104_internal_lot_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )

    op.create_index(
        op.f("ix_refresh_tokens_id"),
        "refresh_tokens",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_refresh_tokens_user_id"),
        "refresh_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_refresh_tokens_token_hash"),
        "refresh_tokens",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_refresh_tokens_token_hash"),
        table_name="refresh_tokens",
    )
    op.drop_index(
        op.f("ix_refresh_tokens_user_id"),
        table_name="refresh_tokens",
    )
    op.drop_index(
        op.f("ix_refresh_tokens_id"),
        table_name="refresh_tokens",
    )
    op.drop_table("refresh_tokens")
