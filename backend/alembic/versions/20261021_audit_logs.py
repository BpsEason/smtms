"""Add transactional audit log and read permission."""

import sqlalchemy as sa
from alembic import op

revision = "20261021_audit_logs"
down_revision = "20261021_nc_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("before_data", sa.JSON(), nullable=True),
        sa.Column("after_data", sa.JSON(), nullable=True),
        sa.Column("request_id", sa.String(100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        comment="唯讀系統稽核紀錄",
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])
    op.create_index("ix_audit_logs_resource", "audit_logs", ["resource_type", "resource_id"])
    op.create_index("ix_audit_logs_actor_created", "audit_logs", ["actor_user_id", "created_at"])
    op.create_index("ix_audit_logs_action_created", "audit_logs", ["action", "created_at"])
    op.execute(
        sa.text("INSERT INTO permissions (code, name) VALUES ('audit:read', 'Read audit logs')")
    )
    op.execute(
        sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'SMTMS Seed Administrator' AND p.code = 'audit:read'
    """)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE rp FROM role_permissions rp JOIN permissions p "
            "ON p.id = rp.permission_id WHERE p.code = 'audit:read'"
        )
    )
    op.execute(sa.text("DELETE FROM permissions WHERE code = 'audit:read'"))
    op.drop_table("audit_logs")
