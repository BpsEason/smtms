from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DECIMAL,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SupplierORM(Base):
    __tablename__ = "suppliers"
    __table_args__ = {"comment": "供應商基本資料"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="供應商主鍵編號")
    supplier_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True, comment="供應商代碼")
    supplier_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True, comment="供應商名稱")
    tax_id: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True, comment="統一編號")
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="聯絡人姓名")
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True, comment="聯絡電話")
    email: Mapped[str | None] = mapped_column(String(160), nullable=True, comment="聯絡信箱")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True, comment="供應商狀態")
    address: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="供應商地址")
    country: Mapped[str | None] = mapped_column(String(80), nullable=True, comment="供應商所在國家")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="更新時間",
    )

    qualification_documents: Mapped[list["SupplierQualificationDocumentORM"]] = relationship(
        back_populates="supplier",
        cascade="all, delete-orphan",
    )
    supplier_materials: Mapped[list["SupplierMaterialORM"]] = relationship(
        back_populates="supplier",
        cascade="all, delete-orphan",
    )
    supplier_lots: Mapped[list["SupplierLotORM"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")
    material_receipts: Mapped[list["MaterialReceiptORM"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")


class SupplierQualificationDocumentORM(Base):
    __tablename__ = "supplier_qualification_documents"
    __table_args__ = {"comment": "供應商資格文件紀錄"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="文件紀錄主鍵")
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True, comment="對應供應商主鍵")
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True, comment="文件類型")
    doc_code: Mapped[str | None] = mapped_column(String(80), nullable=True, comment="文件編號")
    doc_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="文件名稱")
    file_path: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="文件存放路徑")
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="發證日期")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="到期日期")
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True, comment="審核人員主鍵")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True, comment="文件狀態")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    supplier: Mapped[SupplierORM] = relationship(back_populates="qualification_documents")
    attachments: Mapped[list["SupplierDocumentAttachmentORM"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SupplierDocumentAttachmentORM(Base):
    __tablename__ = "supplier_document_attachments"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_supplier_document_attachments_storage_key"),
        {"comment": "供應商資格文件附件 metadata"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="附件主鍵")
    document_id: Mapped[int] = mapped_column(
        ForeignKey("supplier_qualification_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="資格文件主鍵",
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False, comment="原始檔名")
    storage_key: Mapped[str] = mapped_column(String(80), nullable=False, comment="安全相對儲存鍵")
    media_type: Mapped[str] = mapped_column(String(100), nullable=False, comment="驗證後 MIME 類型")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, comment="檔案大小（bytes）")
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, comment="檔案 SHA-256")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    document: Mapped[SupplierQualificationDocumentORM] = relationship(back_populates="attachments")


class MaterialORM(Base):
    __tablename__ = "materials"
    __table_args__ = {"comment": "原物料主檔"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="原物料主鍵")
    material_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True, comment="原物料代碼")
    material_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True, comment="原物料名稱")
    material_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True, comment="物料類型")
    spec: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="規格說明")
    uom: Mapped[str] = mapped_column(String(30), nullable=False, comment="計量單位")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True, comment="物料狀態")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="更新時間",
    )

    supplier_links: Mapped[list["SupplierMaterialORM"]] = relationship(back_populates="material", cascade="all, delete-orphan")
    supplier_lots: Mapped[list["SupplierLotORM"]] = relationship(back_populates="material", cascade="all, delete-orphan")
    internal_lots: Mapped[list["InternalMaterialLotORM"]] = relationship(back_populates="material", cascade="all, delete-orphan")
    receipts: Mapped[list["MaterialReceiptORM"]] = relationship(back_populates="material", cascade="all, delete-orphan")


class SupplierMaterialORM(Base):
    __tablename__ = "supplier_materials"
    __table_args__ = (
        UniqueConstraint("supplier_id", "material_id", name="uq_supplier_materials_supplier_material"),
        {"comment": "供應商原物料對應表"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="對應紀錄主鍵")
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True, comment="供應商主鍵")
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), nullable=False, index=True, comment="原物料主鍵")
    supplier_material_code: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True, comment="供應商料號")
    is_preferred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="是否為首選供應商")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    supplier: Mapped[SupplierORM] = relationship(back_populates="supplier_materials")
    material: Mapped[MaterialORM] = relationship(back_populates="supplier_links")


class SupplierLotORM(Base):
    __tablename__ = "supplier_lots"
    __table_args__ = (
        UniqueConstraint("supplier_id", "material_id", "supplier_lot_no", name="uq_supplier_lots_supplier_material_lot"),
        {"comment": "供應商批次資料"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="批次主鍵")
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True, comment="供應商主鍵")
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), nullable=False, index=True, comment="原物料主鍵")
    supplier_lot_no: Mapped[str] = mapped_column(String(120), nullable=False, index=True, comment="供應商批號")
    manufacturing_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="製造日期")
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="有效日期")
    qty_received: Mapped[Decimal] = mapped_column(DECIMAL(18, 4), nullable=False, default=0, comment="收貨數量")
    uom: Mapped[str] = mapped_column(String(30), nullable=False, comment="批次計量單位")
    qc_status: Mapped[str] = mapped_column(String(20), nullable=False, default="received", index=True, comment="品質狀態")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    supplier: Mapped[SupplierORM] = relationship(back_populates="supplier_lots")
    material: Mapped[MaterialORM] = relationship(back_populates="supplier_lots")
    material_receipts: Mapped[list["MaterialReceiptORM"]] = relationship(back_populates="supplier_lot", cascade="all, delete-orphan")
    internal_material_lots: Mapped[list["InternalMaterialLotORM"]] = relationship(
        back_populates="supplier_lot",
        cascade="all, delete-orphan",
    )


class MaterialReceiptORM(Base):
    __tablename__ = "material_receipts"
    __table_args__ = {"comment": "原物料收料紀錄"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="收料紀錄主鍵")
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True, comment="供應商主鍵")
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), nullable=False, index=True, comment="原物料主鍵")
    supplier_lot_id: Mapped[int] = mapped_column(ForeignKey("supplier_lots.id"), nullable=False, index=True, comment="供應商批次主鍵")
    receipt_no: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True, comment="收料單號")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True, comment="收料時間")
    received_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True, comment="收料人員主鍵")
    qty_received: Mapped[Decimal] = mapped_column(DECIMAL(18, 4), nullable=False, default=0, comment="實際收料數量")
    qty_remaining: Mapped[Decimal] = mapped_column(DECIMAL(18, 4), nullable=False, default=0, comment="剩餘可用數量")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="received", index=True, comment="收料狀態")
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="收料備註")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    supplier: Mapped[SupplierORM] = relationship(back_populates="material_receipts")
    material: Mapped[MaterialORM] = relationship(back_populates="receipts")
    supplier_lot: Mapped[SupplierLotORM] = relationship(back_populates="material_receipts")
    internal_material_lots: Mapped[list["InternalMaterialLotORM"]] = relationship(back_populates="receipt", cascade="all, delete-orphan")
    iqc_records: Mapped[list["IQCRecordORM"]] = relationship(back_populates="receipt", cascade="all, delete-orphan")


class InternalMaterialLotORM(Base):
    __tablename__ = "internal_material_lots"
    __table_args__ = (
        UniqueConstraint("material_id", "internal_lot_no", name="uq_internal_material_lots_material_internal_lot"),
        {"comment": "內部物料批次庫存"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="內部批次主鍵")
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), nullable=False, index=True, comment="原物料主鍵")
    supplier_lot_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_lots.id"), nullable=True, index=True, comment="來源供應商批次主鍵")
    receipt_id: Mapped[int | None] = mapped_column(ForeignKey("material_receipts.id"), nullable=True, index=True, comment="來源收料紀錄主鍵")
    internal_lot_no: Mapped[str] = mapped_column(String(120), nullable=False, index=True, comment="內部批號")
    qty_on_hand: Mapped[Decimal] = mapped_column(DECIMAL(18, 4), nullable=False, default=0, comment="現有庫存量")
    qty_reserved: Mapped[Decimal] = mapped_column(DECIMAL(18, 4), nullable=False, default=0, comment="預留庫存量")
    uom: Mapped[str] = mapped_column(String(30), nullable=False, comment="庫存計量單位")
    lot_status: Mapped[str] = mapped_column(String(20), nullable=False, default="available", index=True, comment="批次狀態")
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="批次有效日期")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    material: Mapped[MaterialORM] = relationship(back_populates="internal_lots")
    supplier_lot: Mapped[SupplierLotORM | None] = relationship(back_populates="internal_material_lots")
    receipt: Mapped[MaterialReceiptORM | None] = relationship(back_populates="internal_material_lots")
    iqc_records: Mapped[list["IQCRecordORM"]] = relationship(back_populates="internal_lot", cascade="all, delete-orphan")


class IQCRecordORM(Base):
    __tablename__ = "iqc_records"
    __table_args__ = {"comment": "來料檢驗紀錄"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="檢驗紀錄主鍵")
    receipt_id: Mapped[int | None] = mapped_column(ForeignKey("material_receipts.id"), nullable=True, index=True, comment="關聯收料紀錄主鍵")
    internal_lot_id: Mapped[int | None] = mapped_column(ForeignKey("internal_material_lots.id"), nullable=True, index=True, comment="關聯內部批次主鍵")
    inspector_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True, comment="檢驗人員主鍵")
    sample_qty: Mapped[Decimal] = mapped_column(DECIMAL(18, 4), nullable=False, default=0, comment="抽樣數量")
    inspection_result: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True, comment="檢驗結果")
    inspection_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="檢驗日期")
    release_status: Mapped[str] = mapped_column(String(20), nullable=False, default="hold", index=True, comment="放行狀態")
    remarks: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="檢驗備註")
    review_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
        comment="品保審核狀態",
    )
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
        comment="最後審核人員主鍵",
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最後審核時間",
    )
    review_decision_note: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="審核結論備註",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    receipt: Mapped[MaterialReceiptORM | None] = relationship(back_populates="iqc_records")
    internal_lot: Mapped[InternalMaterialLotORM | None] = relationship(back_populates="iqc_records")
    quality_reviews: Mapped[list["QualityReviewORM"]] = relationship(
        back_populates="iqc_record",
        cascade="all, delete-orphan",
    )

    @property
    def internal_lot_no(self) -> str | None:
        return self.internal_lot.internal_lot_no if self.internal_lot is not None else None


class QualityReviewORM(Base):
    __tablename__ = "quality_reviews"
    __table_args__ = {"comment": "品保審核歷程"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="審核紀錄主鍵")
    iqc_record_id: Mapped[int] = mapped_column(
        ForeignKey("iqc_records.id"),
        nullable=False,
        index=True,
        comment="關聯檢驗紀錄主鍵",
    )
    review_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
        comment="審核狀態：pending/approved/returned",
    )
    decision: Mapped[str] = mapped_column(
        String(20), nullable=False, default="approved", index=True, comment="審核決策"
    )
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True, comment="審核人員主鍵"
    )
    decision_note: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="審核意見"
    )
    reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="退回原因或補件說明"
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="審核時間"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )

    iqc_record: Mapped[IQCRecordORM] = relationship(back_populates="quality_reviews")
