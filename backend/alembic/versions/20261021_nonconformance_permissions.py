"""Register nonconformance RBAC permissions for existing installations."""

import sqlalchemy as sa
from alembic import op

revision = "20261021_nc_permissions"
down_revision = "20261020_nonconformance"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("seed:nonconformance:read", "Read quality nonconformance cases"),
    ("seed:nonconformance:write", "Manage quality nonconformance cases"),
)
SEEDED_ROLE_GRANTS = {
    "SMTMS Seed Administrator": {code for code, _ in PERMISSIONS},
    "SMTMS Seed QA": {code for code, _ in PERMISSIONS},
}


def upgrade() -> None:
    connection = op.get_bind()
    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Integer),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
    )
    roles = sa.table("roles", sa.column("id", sa.Integer), sa.column("name", sa.String))
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )

    permission_ids = {}
    for code, name in PERMISSIONS:
        permission_id = connection.execute(
            sa.select(permissions.c.id).where(permissions.c.code == code)
        ).scalar_one_or_none()
        if permission_id is None:
            connection.execute(sa.insert(permissions).values(code=code, name=name))
            permission_id = connection.execute(
                sa.select(permissions.c.id).where(permissions.c.code == code)
            ).scalar_one()
        permission_ids[code] = permission_id

    for role_name, codes in SEEDED_ROLE_GRANTS.items():
        role_id = connection.execute(
            sa.select(roles.c.id).where(roles.c.name == role_name)
        ).scalar_one_or_none()
        if role_id is None:
            continue
        for code in codes:
            permission_id = permission_ids[code]
            exists = connection.execute(
                sa.select(role_permissions.c.role_id).where(
                    role_permissions.c.role_id == role_id,
                    role_permissions.c.permission_id == permission_id,
                )
            ).first()
            if exists is None:
                connection.execute(
                    sa.insert(role_permissions).values(
                        role_id=role_id, permission_id=permission_id
                    )
                )


def downgrade() -> None:
    connection = op.get_bind()
    permissions = sa.table(
        "permissions", sa.column("id", sa.Integer), sa.column("code", sa.String)
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )
    permission_ids = sa.select(permissions.c.id).where(
        permissions.c.code.in_([code for code, _ in PERMISSIONS])
    )
    connection.execute(
        sa.delete(role_permissions).where(role_permissions.c.permission_id.in_(permission_ids))
    )
    permission_codes = [code for code, _ in PERMISSIONS]
    connection.execute(
        sa.delete(permissions).where(permissions.c.code.in_(permission_codes))
    )
