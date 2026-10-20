from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NonconformanceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_no: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    source: str = Field(pattern="^(iqc|supplier|production|traceability|other)$")
    severity: str = Field(pattern="^(low|medium|high|critical)$")
    found_at: datetime
    owner_user_id: int | None = Field(default=None, gt=0)
    supplier_id: int | None = Field(default=None, gt=0)
    material_id: int | None = Field(default=None, gt=0)
    receipt_id: int | None = Field(default=None, gt=0)
    supplier_lot_id: int | None = Field(default=None, gt=0)
    internal_lot_id: int | None = Field(default=None, gt=0)
    iqc_record_id: int | None = Field(default=None, gt=0)
    defect_qty: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def normalized(self):
        for field in ("case_no", "title", "description"):
            setattr(self, field, getattr(self, field).strip())
            if not getattr(self, field):
                raise ValueError(f"{field} must not be blank")
        if self.defect_qty is not None and (
            self.defect_qty >= Decimal("100000000000000")
            or self.defect_qty != self.defect_qty.quantize(Decimal("0.0001"))
        ):
            raise ValueError("defect_qty supports at most 4 decimal places")
        return self


class NonconformanceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=4000)
    severity: str | None = Field(default=None, pattern="^(low|medium|high|critical)$")
    status: str | None = Field(
        default=None, pattern="^(open|investigating|pending_confirmation|closed)$"
    )
    owner_user_id: int | None = Field(default=None, gt=0)
    supplier_id: int | None = Field(default=None, gt=0)
    material_id: int | None = Field(default=None, gt=0)
    receipt_id: int | None = Field(default=None, gt=0)
    supplier_lot_id: int | None = Field(default=None, gt=0)
    internal_lot_id: int | None = Field(default=None, gt=0)
    iqc_record_id: int | None = Field(default=None, gt=0)
    defect_qty: Decimal | None = Field(default=None, ge=0)
    investigation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_values(self):
        for key in ("title", "description", "investigation"):
            value = getattr(self, key)
            if key in self.model_fields_set and value is not None:
                setattr(self, key, value.strip())
                if key != "investigation" and not getattr(self, key):
                    raise ValueError(f"{key} must not be blank")
        if self.defect_qty is not None and (
            self.defect_qty >= Decimal("100000000000000")
            or self.defect_qty != self.defect_qty.quantize(Decimal("0.0001"))
        ):
            raise ValueError("defect_qty supports at most 4 decimal places")
        return self


class DispositionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=2000)
    result: str = Field(min_length=1, max_length=1000)
    owner_user_id: int = Field(gt=0)
    executed_at: datetime
