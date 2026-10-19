from sqlalchemy import create_engine, text

from app.core.config import get_settings

TABLES = [
    "users",
    "roles",
    "permissions",
    "user_roles",
    "role_permissions",
    "suppliers",
    "supplier_qualification_documents",
    "materials",
    "supplier_materials",
    "supplier_lots",
    "material_receipts",
    "internal_material_lots",
    "iqc_records",
]
TABLES_SQL = ", ".join(f"'{table}'" for table in TABLES)

engine = create_engine(get_settings().database_url)

with engine.connect() as conn:
    table_rows = conn.execute(
        text(
            "SELECT table_name, table_comment FROM information_schema.tables "
            f"WHERE table_schema = DATABASE() AND table_name IN ({TABLES_SQL}) ORDER BY table_name"
        )
    ).fetchall()
    column_rows = conn.execute(
        text(
            "SELECT table_name, column_name, column_comment FROM information_schema.columns "
            f"WHERE table_schema = DATABASE() AND table_name IN ({TABLES_SQL}) "
            "ORDER BY table_name, ordinal_position"
        )
    ).fetchall()

    print("TABLE COMMENTS")
    for row in table_rows:
        print(row)
    print("COLUMN COMMENTS")
    for row in column_rows:
        print(row)
