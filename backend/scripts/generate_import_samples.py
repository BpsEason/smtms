"""Generate standalone supplier import sample workbooks for local acceptance testing.

Run from backend/: uv run python scripts/generate_import_samples.py

The workbooks reuse ``supplier_import.TEMPLATE_HEADERS`` so the samples always
match the real template layout. Rows only use clearly fake development data and
never collide with the seeded suppliers (``SEED-SUP-*`` / ``seed_supplier_*``).
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from app.services import supplier_import
from openpyxl import Workbook

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "samples"
VALID_FILENAME = "supplier_import_valid.xlsx"
ERROR_FILENAME = "supplier_import_errors.xlsx"

# Three rows that should import successfully (login_password blank -> generated).
VALID_ROWS: tuple[dict[str, object], ...] = (
    {
        "supplier_code": "DEMO-SUP-201",
        "supplier_name": "示範供應商甲股份有限公司",
        "tax_id": "81000001",
        "contact_name": "陳大同",
        "phone": "02-2000-2001",
        "email": "demo201@example.test",
        "country": "Taiwan",
        "address": "台北市信義區示範路 201 號",
        "status": "active",
        "login_username": "demo_sup_201",
        "login_email": "demo201@example.test",
    },
    {
        "supplier_code": "DEMO-SUP-202",
        "supplier_name": "示範供應商乙股份有限公司",
        "tax_id": "81000002",
        "contact_name": "林可欣",
        "phone": "04-2000-2002",
        "email": "demo202@example.test",
        "country": "Taiwan",
        "address": "台中市西屯區示範路 202 號",
        "status": "active",
        "login_username": "demo_sup_202",
        "login_email": "demo202@example.test",
    },
    {
        "supplier_code": "DEMO-SUP-203",
        "supplier_name": "示範供應商丙股份有限公司",
        "tax_id": "81000003",
        "contact_name": "黃柏翰",
        "phone": "07-2000-2003",
        "email": "demo203@example.test",
        "country": "Taiwan",
        "address": "高雄市苓雅區示範路 203 號",
        "status": "active",
        "login_username": "demo_sup_203",
        "login_email": "demo203@example.test",
    },
)

# Rows that intentionally break one validation rule each.
#  - rows 2-3: duplicate supplier_code
#  - rows 2/4: duplicate tax_id
#  - rows 3/5: duplicate login_username
#  - rows 6-7: missing required field (supplier_name / login_username)
ERROR_ROWS: tuple[dict[str, object], ...] = (
    {
        "supplier_code": "DEMO-ERR-301",
        "supplier_name": "錯誤範例甲股份有限公司",
        "tax_id": "82000001",
        "contact_name": "王小明",
        "phone": "02-2000-3001",
        "email": "err301@example.test",
        "country": "Taiwan",
        "address": "台北市中山區錯誤路 301 號",
        "status": "active",
        "login_username": "demo_err_301",
        "login_email": "err301@example.test",
    },
    {
        "supplier_code": "DEMO-ERR-301",
        "supplier_name": "錯誤範例甲（編號重複）",
        "tax_id": "82000002",
        "status": "active",
        "login_username": "demo_err_302",
    },
    {
        "supplier_code": "DEMO-ERR-303",
        "supplier_name": "錯誤範例乙（統編重複）",
        "tax_id": "82000001",
        "status": "active",
        "login_username": "demo_err_303",
    },
    {
        "supplier_code": "DEMO-ERR-304",
        "supplier_name": "錯誤範例丙（帳號重複）",
        "tax_id": "82000003",
        "status": "active",
        "login_username": "demo_err_302",
    },
    {
        "supplier_code": "DEMO-ERR-306",
        "supplier_name": None,
        "tax_id": "82000004",
        "status": "active",
        "login_username": "demo_err_306",
    },
    {
        "supplier_code": "DEMO-ERR-307",
        "supplier_name": "錯誤範例戊（缺登入帳號）",
        "tax_id": "82000005",
        "status": "active",
        "login_username": None,
    },
)


def _workbook_bytes(rows: tuple[dict[str, object], ...]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = supplier_import.SHEET_TITLE
    sheet.append(list(supplier_import.TEMPLATE_HEADERS))
    for row in rows:
        sheet.append([row.get(column) for column in supplier_import.TEMPLATE_HEADERS])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def build_valid_workbook_bytes() -> bytes:
    return _workbook_bytes(VALID_ROWS)


def build_error_workbook_bytes() -> bytes:
    return _workbook_bytes(ERROR_ROWS)


def main() -> int:
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    valid_path = SAMPLE_DIR / VALID_FILENAME
    error_path = SAMPLE_DIR / ERROR_FILENAME
    valid_path.write_bytes(build_valid_workbook_bytes())
    error_path.write_bytes(build_error_workbook_bytes())
    print(f"Wrote {valid_path} ({len(VALID_ROWS)} rows, all valid).")
    print(f"Wrote {error_path} ({len(ERROR_ROWS)} rows, intentionally invalid).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
