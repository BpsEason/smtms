"""Link supplier login accounts to suppliers and add a forced password change flag.

Revision ID: 20261019_supplier_user_link
Revises: 20261019_comments_first_schema
Create Date: 2026-10-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261019_supplier_user_link"
down_revision = "20261019_comments_first_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("supplier_id", sa.Integer(), nullable=True, comment="對應供應商主鍵（供應商登入帳號專用）"),
    )
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
            comment="是否須於下次登入變更密碼",
        ),
    )
    op.create_index("ix_users_supplier_id", "users", ["supplier_id"], unique=True)
    op.create_foreign_key("fk_users_supplier_id", "users", "suppliers", ["supplier_id"], ["id"])

    op.add_column(
        "suppliers",
        sa.Column("tax_id", sa.String(20), nullable=True, comment="統一編號"),
    )
    op.create_index("ix_suppliers_tax_id", "suppliers", ["tax_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_suppliers_tax_id", table_name="suppliers")
    op.drop_column("suppliers", "tax_id")
    op.drop_constraint("fk_users_supplier_id", "users", type_="foreignkey")
    op.drop_index("ix_users_supplier_id", table_name="users")
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "supplier_id")
