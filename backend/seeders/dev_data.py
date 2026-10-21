"""Stable identifiers and deterministic development seed data."""

SEED_USER_PREFIX = "seed_"
SEED_SUPPLIER_USER_PREFIX = "seed_supplier_"
SEED_ROLE_NAMES = ("SMTMS Seed Administrator", "SMTMS Seed QA", "SMTMS Seed Receiver")
SEED_PERMISSION_PREFIX = "seed:"
SEED_SUPPLIER_PREFIX = "SEED-SUP-"
SEED_MATERIAL_PREFIX = "SEED-MAT-"
SEED_SUPPLIER_LOT_PREFIX = "SEED-SLOT-"
SEED_RECEIPT_PREFIX = "SEED-REC-"
SEED_INTERNAL_LOT_PREFIX = "SEED-ILOT-"
SEED_DOCUMENT_PREFIX = "SEED-CERT-"
SEED_IQC_REMARK_PREFIX = "Seeded inspection outcome:"
SEED_REQUIRED_REVISION = "20261021_audit_logs"
SEED_REVIEW_NOTE_PREFIX = "SEED-SIGNOFF:"

SUPPLIER_DATA = (
    (
        "Harbor Industrial Supply",
        "林怡君",
        "02-2550-1001",
        "harbor@example.test",
        "Taiwan",
        "91000001",
        "active",
    ),
    (
        "Evergreen Polymer Co.",
        "陳冠宇",
        "04-2300-2002",
        "evergreen@example.test",
        "Taiwan",
        "91000002",
        "active",
    ),
    (
        "Northstar Components",
        "王雅婷",
        "03-5500-3003",
        "northstar@example.test",
        "Taiwan",
        "91000003",
        "active",
    ),
    (
        "Pacific Precision Materials",
        "李承翰",
        "07-3300-4004",
        "pacific@example.test",
        "Taiwan",
        "91000004",
        "active",
    ),
    (
        "Summit Chemical Works",
        "張家豪",
        "06-2200-5005",
        "summit@example.test",
        "Taiwan",
        "91000005",
        "inactive",
    ),
    (
        "Cedar Packaging Group",
        "黃詩涵",
        "02-2600-6006",
        "cedar@example.test",
        "Taiwan",
        "91000006",
        "active",
    ),
)

MATERIAL_DATA = (
    ("Aluminum Housing", "metal", "ADC12 die-cast, 120 x 80 mm", "pcs"),
    ("Copper Busbar", "metal", "C1100, 3 x 25 x 200 mm", "pcs"),
    ("Silicone Gasket", "polymer", "VMQ, 60 Shore A, 2 mm", "pcs"),
    ("Epoxy Adhesive", "chemical", "Two-part, 1:1 mix, 500 ml", "set"),
    ("Control PCB", "electronic", "FR-4, 4-layer, 1.6 mm", "pcs"),
    ("Stainless Fastener", "hardware", "SUS304 M4 x 12 mm", "pcs"),
    ("Protective Film", "packaging", "PE, 0.08 mm x 500 mm", "roll"),
    ("Thermal Pad", "polymer", "Silicone, 3 W/mK, 1 mm", "pcs"),
    ("Power Connector", "electronic", "10-pin, 5.08 mm pitch", "pcs"),
    ("Powder Coating", "chemical", "RAL 9005, matte black", "kg"),
    ("Carton Box", "packaging", "Double-wall, 400 x 300 x 200 mm", "pcs"),
    ("Copper Wire", "metal", "Annealed copper, 1.5 mm²", "m"),
)

PERMISSIONS = (
    ("suppliers:read", "Read suppliers"),
    ("suppliers:write", "Manage suppliers"),
    ("materials:read", "Read materials"),
    ("materials:write", "Manage materials"),
    ("receipts:read", "Read material receipts"),
    ("receipts:write", "Create material receipts"),
    ("iqc:read", "Read incoming inspections"),
    ("iqc:write", "Manage incoming inspections"),
    ("supplier-lots:write", "Create supplier lots"),
    ("quality:review", "Review incoming inspections"),
    ("quality:approve", "Approve incoming inspections"),
    ("quality:return", "Return incoming inspections for correction"),
    ("nonconformance:read", "Read quality nonconformance cases"),
    ("nonconformance:write", "Manage quality nonconformance cases"),
    ("users:manage", "Manage user access"),
    ("audit:read", "Read audit logs"),
)

INTERNAL_USERS = (
    ("seed_admin", "seed_admin@example.test"),
    ("seed_qa_1", "seed_qa_1@example.test"),
    ("seed_qa_2", "seed_qa_2@example.test"),
    ("seed_receiver_1", "seed_receiver_1@example.test"),
)

ROLE_PERMISSION_CODES = {
    "admin": tuple(code for code, _ in PERMISSIONS),
    "qa": (
        "suppliers:read",
        "materials:read",
        "receipts:read",
        "iqc:read",
        "iqc:write",
        "quality:review",
        "quality:approve",
        "quality:return",
        "nonconformance:read",
        "nonconformance:write",
    ),
    "receiver": (
        "suppliers:read",
        "materials:read",
        "receipts:read",
        "receipts:write",
        "supplier-lots:write",
    ),
}

# Supported values are stored as strings by the current schema (no database ENUM/check constraints).
# Keep related QC, release, and inventory states aligned in this mapping.
BATCH_OUTCOMES = (
    "passed",
    "pending",
    "failed",
    "passed",
    "passed",
    "pending",
    "failed",
    "passed",
    "passed",
    "failed",
    "passed",
    "pending",
    "passed",
    "failed",
    "passed",
    "pending",
    "passed",
    "failed",
    "passed",
    "passed",
)

EXPECTED_SEEDED_COUNTS = {
    "suppliers": 6,
    "supplier_accounts": 6,
    "internal_users": 4,
    "materials": 12,
    "supplier_materials": 24,
    "qualification_documents": 6,
    "supplier_lots": 20,
    "material_receipts": 20,
    "internal_material_lots": 25,
    "iqc_records": 25,
    "roles": 3,
    "permissions": len(PERMISSIONS),
    "user_roles": 10,
    "role_permissions": 31,
    "nonconformance_cases": 12,
}
