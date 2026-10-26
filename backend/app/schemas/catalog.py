from datetime import datetime
from decimal import Decimal
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ORMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SupplierCreate(BaseModel):
    supplier_code: str = Field(min_length=1, max_length=80)
    supplier_name: str = Field(min_length=1, max_length=200)
    tax_id: str | None = Field(default=None, max_length=20)
    contact_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    status: str = Field(default="active", min_length=1, max_length=20)
    address: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=80)

    @field_validator("tax_id", mode="before")
    @classmethod
    def normalize_tax_id(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class SupplierUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_code: str | None = Field(default=None, min_length=1, max_length=80)
    supplier_name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    status: str | None = Field(default=None, min_length=1, max_length=20)
    address: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def reject_null_required_fields(self):
        for field_name in ("supplier_code", "supplier_name", "status"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class SupplierResponse(ORMResponse):
    id: int
    supplier_code: str
    supplier_name: str
    tax_id: str | None
    contact_name: str | None
    phone: str | None
    email: str | None
    status: str
    address: str | None
    country: str | None
    created_at: datetime
    updated_at: datetime


class SupplierDocumentResponse(ORMResponse):
    id: int
    supplier_id: int
    doc_type: str
    doc_code: str | None
    doc_name: str
    file_path: str | None
    issued_at: datetime | None
    expires_at: datetime | None
    approved_by_user_id: int | None
    status: str
    created_at: datetime


class SupplierDocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    doc_type: str = Field(min_length=1, max_length=50)
    doc_code: str | None = Field(default=None, max_length=80)
    doc_name: str = Field(min_length=1, max_length=200)
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    status: str = Field(default="active", min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_document(self):
        self.doc_type = self.doc_type.strip()
        self.doc_name = self.doc_name.strip()
        if not self.doc_type or not self.doc_name:
            raise ValueError("Document type and name must not be blank")
        if self.doc_code is not None:
            self.doc_code = self.doc_code.strip() or None
        if self.expires_at and self.issued_at and self.expires_at < self.issued_at:
            raise ValueError("Document expiry date cannot precede issue date")
        return self


class SupplierDocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    doc_type: str | None = Field(default=None, min_length=1, max_length=50)
    doc_code: str | None = Field(default=None, max_length=80)
    doc_name: str | None = Field(default=None, min_length=1, max_length=200)
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    status: str | None = Field(default=None, min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_document(self):
        for name in ("doc_type", "doc_name", "status"):
            if name in self.model_fields_set:
                value = getattr(self, name)
                if value is None or not value.strip():
                    raise ValueError(f"{name} must not be blank")
                setattr(self, name, value.strip())
        if "doc_code" in self.model_fields_set and self.doc_code is not None:
            self.doc_code = self.doc_code.strip() or None
        return self


class SupplierDocumentAttachmentResponse(ORMResponse):
    id: int
    document_id: int
    original_filename: str
    media_type: str
    size_bytes: int
    sha256: str
    created_at: datetime


class SupplierImportRowError(BaseModel):
    sheet: str
    row: int
    field: str
    message: str


class SupplierImportRowPreview(BaseModel):
    row: int
    supplier_code: str | None
    supplier_name: str | None
    tax_id: str | None
    login_username: str | None
    login_email: str | None
    status: str | None
    valid: bool


class SupplierImportPreviewResponse(BaseModel):
    sheet: str
    total_rows: int
    valid_rows: int
    error_rows: int
    skipped_rows: int
    rows: list[SupplierImportRowPreview]
    errors: list[SupplierImportRowError]


class SupplierImportCreatedAccount(BaseModel):
    sheet: str
    row: int
    supplier_id: int
    supplier_code: str
    login_username: str
    initial_password: str
    password_generated: bool


class SupplierImportResultResponse(BaseModel):
    status: Literal["completed", "rejected"]
    created: int
    failed: int
    skipped: int
    errors: list[SupplierImportRowError]
    accounts: list[SupplierImportCreatedAccount]


class MaterialCreate(BaseModel):
    material_code: str = Field(min_length=1, max_length=80)
    material_name: str = Field(min_length=1, max_length=200)
    material_type: str = Field(min_length=1, max_length=50)
    spec: str | None = Field(default=None, max_length=255)
    uom: str = Field(min_length=1, max_length=30)
    status: str = Field(default="active", min_length=1, max_length=20)


class MaterialUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    material_code: str | None = Field(default=None, min_length=1, max_length=80)
    material_name: str | None = Field(default=None, min_length=1, max_length=200)
    material_type: str | None = Field(default=None, min_length=1, max_length=50)
    spec: str | None = Field(default=None, max_length=255)
    uom: str | None = Field(default=None, min_length=1, max_length=30)
    status: str | None = Field(default=None, min_length=1, max_length=20)

    @model_validator(mode="after")
    def reject_null_required_fields(self):
        for field_name in ("material_code", "material_name", "material_type", "uom", "status"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class MaterialResponse(ORMResponse):
    id: int
    material_code: str
    material_name: str
    material_type: str
    spec: str | None
    uom: str
    status: str
    created_at: datetime
    updated_at: datetime


class SupplierMaterialCreate(BaseModel):
    material_id: int = Field(gt=0)
    supplier_material_code: str | None = Field(default=None, max_length=80)
    is_preferred: bool = False


class SupplierMaterialResponse(ORMResponse):
    id: int
    supplier_id: int
    material_id: int
    supplier_material_code: str | None
    is_preferred: bool
    created_at: datetime


class SupplierLotResponse(ORMResponse):
    id: int
    supplier_id: int
    material_id: int
    supplier_lot_no: str
    manufacturing_date: datetime | None
    expiry_date: datetime | None
    qty_received: Decimal
    uom: str
    qc_status: str
    created_at: datetime


class SupplierLotCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_id: int = Field(gt=0)
    material_id: int = Field(gt=0)
    supplier_lot_no: str = Field(min_length=1, max_length=120)
    manufacturing_date: datetime | None = None
    expiry_date: datetime | None = None
    qty_received: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.manufacturing_date is not None
            and self.expiry_date is not None
            and self.expiry_date < self.manufacturing_date
        ):
            raise ValueError("Expiry date cannot be earlier than manufacturing date")
        if self.qty_received >= Decimal("100000000000000"):
            raise ValueError("qty_received exceeds the supported precision")
        if self.qty_received != self.qty_received.quantize(Decimal("0.0001")):
            raise ValueError("qty_received supports at most 4 decimal places")
        return self


class SupplierLotUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_lot_no: str | None = Field(default=None, min_length=1, max_length=120)
    manufacturing_date: datetime | None = None
    expiry_date: datetime | None = None
    qc_status: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.manufacturing_date is not None
            and self.expiry_date is not None
            and self.expiry_date < self.manufacturing_date
        ):
            raise ValueError("Expiry date cannot be earlier than manufacturing date")
        return self


class ReceiptCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_id: int = Field(gt=0)
    material_id: int = Field(gt=0)
    supplier_lot_id: int = Field(gt=0)
    receipt_no: str = Field(min_length=1, max_length=80)
    qty_received: Decimal = Field(gt=0)
    received_at: datetime
    notes: str | None = Field(default=None, max_length=500)


class ReceiptResponse(ORMResponse):
    id: int
    supplier_id: int
    material_id: int
    supplier_lot_id: int
    receipt_no: str
    received_at: datetime
    received_by_user_id: int | None
    qty_received: Decimal
    qty_remaining: Decimal
    status: str
    notes: str | None
    created_at: datetime


class ReceiptIQCSummary(BaseModel):
    id: int
    inspection_result: str
    release_status: str
    review_status: str


class ReceiptListResponse(ReceiptResponse):
    # None means this caller cannot read IQC data; [] means the receipt has no IQC records.
    iqc_records: list[ReceiptIQCSummary] | None = None
    supplier_code: str
    supplier_name: str
    material_code: str
    material_name: str
    material_uom: str
    supplier_lot_no: str
    supplier_lot_uom: str


class InternalLotCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internal_lot_no: str = Field(min_length=1, max_length=120)
    qty: Decimal = Field(gt=0)
    expiry_date: datetime | None = None


class InternalLotResponse(ORMResponse):
    id: int
    material_id: int
    supplier_lot_id: int | None
    receipt_id: int | None
    internal_lot_no: str
    qty_on_hand: Decimal
    qty_reserved: Decimal
    uom: str
    lot_status: str
    expiry_date: datetime | None
    created_at: datetime


class IQCCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipt_id: int | None = Field(default=None, gt=0)
    internal_lot_id: int | None = Field(default=None, gt=0)
    sample_qty: Decimal = Field(gt=0)
    inspection_result: str = Field(default="pending", min_length=1, max_length=20)
    inspection_date: datetime | None = None
    release_status: str = Field(default="hold", min_length=1, max_length=20)
    remarks: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_reference(self):
        if self.receipt_id is None and self.internal_lot_id is None:
            raise ValueError("Either receipt_id or internal_lot_id is required")
        if self.inspection_result not in {"pending", "passed", "failed"}:
            raise ValueError("inspection_result must be pending, passed, or failed")
        if self.release_status not in {"hold", "released", "rejected"}:
            raise ValueError("release_status must be hold, released, or rejected")
        if self.inspection_result == "passed" and self.release_status != "released":
            raise ValueError("Passed inspection requires release_status='released'")
        if self.inspection_result == "pending" and self.release_status != "hold":
            raise ValueError("Pending inspection requires release_status='hold'")
        if self.inspection_result == "failed" and self.release_status != "rejected":
            raise ValueError("Failed inspection requires release_status='rejected'")
        return self


class IQCUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipt_id: int | None = Field(default=None, gt=0)
    internal_lot_id: int | None = Field(default=None, gt=0)
    sample_qty: Decimal | None = Field(default=None, gt=0)
    inspection_result: str | None = Field(default=None, min_length=1, max_length=20)
    inspection_date: datetime | None = None
    release_status: str | None = Field(default=None, min_length=1, max_length=20)
    remarks: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def reject_null_required_fields(self):
        for field_name in ("inspection_result", "release_status"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        if "inspection_result" in self.model_fields_set and self.inspection_result not in {
            "pending",
            "passed",
            "failed",
        }:
            raise ValueError("inspection_result must be pending, passed, or failed")
        if "release_status" in self.model_fields_set and self.release_status not in {
            "hold",
            "released",
            "rejected",
        }:
            raise ValueError("release_status must be hold, released, or rejected")
        if (
            self.inspection_result == "passed"
            and self.release_status is not None
            and self.release_status != "released"
        ):
            raise ValueError("Passed inspection requires release_status='released'")
        if (
            self.inspection_result == "pending"
            and self.release_status is not None
            and self.release_status != "hold"
        ):
            raise ValueError("Pending inspection requires release_status='hold'")
        if (
            self.inspection_result == "failed"
            and self.release_status is not None
            and self.release_status != "rejected"
        ):
            raise ValueError("Failed inspection requires release_status='rejected'")
        return self


class IQCRecordResponse(ORMResponse):
    id: int
    receipt_id: int | None
    internal_lot_id: int | None
    internal_lot_no: str | None = None
    inspector_user_id: int | None
    sample_qty: Decimal
    inspection_result: str
    inspection_date: datetime | None
    release_status: str
    remarks: str | None
    review_status: str
    reviewed_by_user_id: int | None
    reviewed_at: datetime | None
    review_decision_note: str | None
    created_at: datetime


class QualityReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision_note: str | None = Field(default=None, max_length=500)
    reason: str | None = Field(default=None, max_length=500)


class QualityReviewResponse(ORMResponse):
    id: int
    iqc_record_id: int
    review_status: str
    decision: str
    reviewed_by_user_id: int | None
    reviewed_by_username: str | None = None
    decision_note: str | None
    reason: str | None
    reviewed_at: datetime | None
    created_at: datetime


class ReceiptTraceLot(BaseModel):
    internal_lot: InternalLotResponse
    iqc_records: list[IQCRecordResponse]


class ReceiptTraceResponse(BaseModel):
    receipt: ReceiptResponse
    supplier: SupplierResponse
    material: MaterialResponse
    supplier_lot: SupplierLotResponse
    receipt_iqc_records: list[IQCRecordResponse]
    internal_lots: list[ReceiptTraceLot]


class TraceabilityIQCResponse(BaseModel):
    iqc_record: IQCRecordResponse
    review_history: list[QualityReviewResponse]


class TraceabilityLotResponse(BaseModel):
    internal_lot: InternalLotResponse
    iqc_records: list[TraceabilityIQCResponse]


class TraceabilityReceiptResponse(BaseModel):
    receipt: ReceiptResponse
    supplier: SupplierResponse
    material: MaterialResponse
    supplier_lot: SupplierLotResponse
    receipt_iqc_records: list[TraceabilityIQCResponse]
    internal_lots: list[TraceabilityLotResponse]


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int