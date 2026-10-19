from datetime import datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ORMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SupplierCreate(BaseModel):
    supplier_code: str = Field(min_length=1, max_length=80)
    supplier_name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    status: str = Field(default="active", min_length=1, max_length=20)
    address: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=80)


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
        if "inspection_result" in self.model_fields_set and self.inspection_result not in {"pending", "passed", "failed"}:
            raise ValueError("inspection_result must be pending, passed, or failed")
        if "release_status" in self.model_fields_set and self.release_status not in {"hold", "released", "rejected"}:
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
    inspector_user_id: int | None
    sample_qty: Decimal
    inspection_result: str
    inspection_date: datetime | None
    release_status: str
    remarks: str | None
    created_at: datetime


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
