"""Update internal_material_lots unique constraint to enforce global internal_lot_no uniqueness.

Revision ID: 20261104_update_internal_lot_unique_constraint
Revises: 20261021_nonconformance_permissions
Create Date: 2026-11-04

"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261104_internal_lot_unique"
down_revision = "20261021_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the old unique constraint that only enforced uniqueness per material
    op.drop_constraint(
        "uq_internal_material_lots_material_internal_lot", "internal_material_lots", type_="unique"
    )

    # Create new unique constraint to enforce global uniqueness of internal_lot_no
    op.create_unique_constraint(
        "uq_internal_material_lots_internal_lot_no", "internal_material_lots", ["internal_lot_no"]
    )


def downgrade() -> None:
    # Revert the changes if needed
    op.drop_constraint(
        "uq_internal_material_lots_internal_lot_no", "internal_material_lots", type_="unique"
    )
    op.create_unique_constraint(
        "uq_internal_material_lots_material_internal_lot",
        "internal_material_lots",
        ["material_id", "internal_lot_no"],
    )
