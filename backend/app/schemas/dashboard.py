from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ReceiptSummary(BaseModel):
    total: int


class InternalLotSummary(BaseModel):
    total: int
    by_lot_status: dict[str, int]


class IQCSummary(BaseModel):
    total: int
    pending_review: int
    passed: int
    failed: int


class NonconformanceSummary(BaseModel):
    total: int
    open: int
    closed: int


class DashboardSummaryResponse(BaseModel):
    receipts: ReceiptSummary | None = None
    internal_lots: InternalLotSummary | None = None
    iqc: IQCSummary | None = None
    nonconformances: NonconformanceSummary | None = None


class QualityTrendPoint(BaseModel):
    year_month: str = Field(description="統計月份（YYYY-MM），依 inspection_date 分組")
    total: int = Field(description="當月 IQC 檢驗紀錄總數（inspection_date 不為 null）")
    passed: int = Field(description="當月檢驗結果為 passed 的筆數")
    failed: int = Field(description="當月檢驗結果為 failed 的筆數")
    pass_rate: float = Field(description="合格率 = passed / (passed + failed)，分母為 0 時為 0")


class QualityTrendResponse(BaseModel):
    items: list[QualityTrendPoint] = Field(description="依月份排序的品質趨勢資料")


class PendingIQCItem(BaseModel):
    type: str = Field(description="待辦類型", default="pending_iqc")
    id: int = Field(description="IQC 紀錄 ID")
    internal_lot_no: str | None = Field(description="內部批號")
    receipt_no: str | None = Field(description="收料單號")
    supplier_code: str | None = Field(description="供應商代碼")
    supplier_name: str | None = Field(description="供應商名稱")
    material_code: str | None = Field(description="物料代碼")
    material_name: str | None = Field(description="物料名稱")
    inspection_result: str = Field(description="檢驗結果")
    review_status: str = Field(description="審核狀態")
    created_at: datetime = Field(description="建立時間")
    detail_path: str = Field(description="詳細頁面路徑")


class OpenNCItem(BaseModel):
    type: str = Field(description="待辦類型", default="open_nc")
    id: int = Field(description="不合格案件 ID")
    case_no: str = Field(description="案件編號")
    title: str = Field(description="案件標題")
    status: str = Field(description="案件狀態")
    severity: str = Field(description="嚴重程度")
    supplier_code: str | None = Field(description="供應商代碼")
    supplier_name: str | None = Field(description="供應商名稱")
    material_code: str | None = Field(description="物料代碼")
    material_name: str | None = Field(description="物料名稱")
    found_at: datetime = Field(description="發現時間")
    detail_path: str = Field(description="詳細頁面路徑")


class DashboardTodosResponse(BaseModel):
    pending_iqc: list[PendingIQCItem] = Field(default_factory=list, description="待審核 IQC 清單")
    open_nc: list[OpenNCItem] = Field(default_factory=list, description="未結案不合格案件清單")
