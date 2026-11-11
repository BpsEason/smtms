from __future__ import annotations

from datetime import datetime
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, extract, func, or_, select
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, _ensure_password_changed, get_current_user
from app.db.session import get_db
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    NonconformanceORM,
    SupplierLotORM,
    SupplierORM,
)
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    DashboardTodosResponse,
    InternalLotSummary,
    IQCSummary,
    NonconformanceSummary,
    OpenNCItem,
    PendingIQCItem,
    QualityTrendPoint,
    ReceiptSummary,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

RECEIPTS_PERMS = {"receipts:read"}
INTERNAL_LOTS_PERMS = {"materials:read"}
IQC_PERMS = {"iqc:read", "quality:review", "quality:approve", "quality:return"}
NONCONFORMANCE_PERMS = {"nonconformance:read"}


def _supplier_receipt_ids_subquery(current_user: AuthenticatedUser):
    return select(MaterialReceiptORM.id).where(
        MaterialReceiptORM.supplier_id == current_user.supplier_id
    )


def _supplier_lot_ids_subquery(current_user: AuthenticatedUser):
    return select(SupplierLotORM.id).where(SupplierLotORM.supplier_id == current_user.supplier_id)


def _supplier_internal_lot_condition(current_user: AuthenticatedUser):
    receipt_ids = _supplier_receipt_ids_subquery(current_user)
    lot_ids = _supplier_lot_ids_subquery(current_user)
    return or_(
        InternalMaterialLotORM.receipt_id.in_(receipt_ids),
        InternalMaterialLotORM.supplier_lot_id.in_(lot_ids),
    )


def _supplier_iqc_condition(current_user: AuthenticatedUser):
    receipt_ids = _supplier_receipt_ids_subquery(current_user)
    lot_ids = _supplier_lot_ids_subquery(current_user)
    internal_lot_ids = select(InternalMaterialLotORM.id).where(
        or_(
            InternalMaterialLotORM.receipt_id.in_(receipt_ids),
            InternalMaterialLotORM.supplier_lot_id.in_(lot_ids),
        )
    )
    return or_(
        IQCRecordORM.receipt_id.in_(receipt_ids),
        IQCRecordORM.internal_lot_id.in_(internal_lot_ids),
    )


@router.get("/summary", response_model=DashboardSummaryResponse, response_model_exclude_none=True)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardSummaryResponse:
    _ensure_password_changed(current_user)
    granted = set(current_user.permissions)

    can_receipts = bool(granted & RECEIPTS_PERMS)
    can_internal_lots = bool(granted & INTERNAL_LOTS_PERMS)
    can_iqc = bool(granted & IQC_PERMS)
    can_nonconformance = bool(granted & NONCONFORMANCE_PERMS)

    if not (can_receipts or can_internal_lots or can_iqc or can_nonconformance):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    is_supplier = current_user.supplier_id is not None
    response = DashboardSummaryResponse()

    if can_receipts:
        receipt_stmt = select(func.count()).select_from(MaterialReceiptORM)
        if is_supplier:
            receipt_stmt = receipt_stmt.where(
                MaterialReceiptORM.supplier_id == current_user.supplier_id
            )
        receipt_total = int(db.scalar(receipt_stmt) or 0)
        response.receipts = ReceiptSummary(total=receipt_total)

    if can_internal_lots:
        lot_stmt = select(func.count()).select_from(InternalMaterialLotORM)
        if is_supplier:
            lot_stmt = lot_stmt.where(_supplier_internal_lot_condition(current_user))
        lot_total = int(db.scalar(lot_stmt) or 0)

        lot_status_stmt = select(
            InternalMaterialLotORM.lot_status,
            func.count(InternalMaterialLotORM.id),
        ).group_by(InternalMaterialLotORM.lot_status)
        if is_supplier:
            lot_status_stmt = lot_status_stmt.where(_supplier_internal_lot_condition(current_user))
        lot_by_status = {
            lot_status: int(count) for lot_status, count in db.execute(lot_status_stmt).all()
        }
        response.internal_lots = InternalLotSummary(total=lot_total, by_lot_status=lot_by_status)

    if can_iqc:
        iqc_stmt = select(
            func.count(IQCRecordORM.id),
            func.coalesce(func.sum(case((IQCRecordORM.review_status == "pending", 1), else_=0)), 0),
            func.coalesce(
                func.sum(case((IQCRecordORM.inspection_result == "passed", 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((IQCRecordORM.inspection_result == "failed", 1), else_=0)), 0
            ),
        ).select_from(IQCRecordORM)
        if is_supplier:
            iqc_stmt = iqc_stmt.where(_supplier_iqc_condition(current_user))
        iqc_row = db.execute(iqc_stmt).one()
        response.iqc = IQCSummary(
            total=int(iqc_row[0] or 0),
            pending_review=int(iqc_row[1] or 0),
            passed=int(iqc_row[2] or 0),
            failed=int(iqc_row[3] or 0),
        )

    if can_nonconformance:
        nc_stmt = select(
            func.count(NonconformanceORM.id),
            func.coalesce(func.sum(case((NonconformanceORM.status == "closed", 1), else_=0)), 0),
            func.coalesce(func.sum(case((NonconformanceORM.status != "closed", 1), else_=0)), 0),
        ).select_from(NonconformanceORM)
        if is_supplier:
            nc_stmt = nc_stmt.where(NonconformanceORM.supplier_id == current_user.supplier_id)
        nc_row = db.execute(nc_stmt).one()
        response.nonconformances = NonconformanceSummary(
            total=int(nc_row[0] or 0),
            open=int(nc_row[2] or 0),
            closed=int(nc_row[1] or 0),
        )

    return response


@router.get("/quality-trend", response_model=list[QualityTrendPoint])
def get_quality_trend(
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[QualityTrendPoint]:
    _ensure_password_changed(current_user)
    granted = set(current_user.permissions)
    can_iqc = bool(granted & IQC_PERMS)
    if not can_iqc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    is_supplier = current_user.supplier_id is not None

    # 統計日期採用 IQC 檢驗日期（inspection_date）；僅統計檢驗日期非 null 的紀錄。
    # 以資料庫層級按年月分組與彙總，不由前端下載明細計算。
    year_expr = extract("year", IQCRecordORM.inspection_date)
    month_expr = extract("month", IQCRecordORM.inspection_date)

    stmt = (
        select(
            year_expr.label("year"),
            month_expr.label("month"),
            func.count(IQCRecordORM.id).label("total"),
            func.coalesce(
                func.sum(case((IQCRecordORM.inspection_result == "passed", 1), else_=0)), 0
            ).label("passed"),
            func.coalesce(
                func.sum(case((IQCRecordORM.inspection_result == "failed", 1), else_=0)), 0
            ).label("failed"),
        )
        .select_from(IQCRecordORM)
        .where(IQCRecordORM.inspection_date.is_not(None))
    )

    if date_from is not None:
        stmt = stmt.where(IQCRecordORM.inspection_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(IQCRecordORM.inspection_date <= date_to)

    if is_supplier:
        # 供應商使用者僅能統計與自己供應商關聯的 IQC 紀錄。
        stmt = stmt.where(_supplier_iqc_condition(current_user))

    stmt = stmt.group_by(year_expr, month_expr).order_by(year_expr, month_expr)

    rows = db.execute(stmt).all()
    trend: list[QualityTrendPoint] = []
    for year, month, total, passed, failed in rows:
        total = int(cast(int, total or 0))
        passed = int(cast(int, passed or 0))
        failed = int(cast(int, failed or 0))
        denominator = passed + failed
        # 合格率以已下檢（passed + failed）為分母，pending 未下檢不納入；
        # 分母為 0 時回傳 0，避免除以零。
        pass_rate = round(passed / denominator, 4) if denominator > 0 else 0.0
        trend.append(
            QualityTrendPoint(
                year_month=f"{cast(int, year):04d}-{cast(int, month):02d}",
                total=total,
                passed=passed,
                failed=failed,
                pass_rate=pass_rate,
            )
        )
    return trend


@router.get("/todos", response_model=DashboardTodosResponse)
def get_dashboard_todos(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardTodosResponse:
    _ensure_password_changed(current_user)
    granted = set(current_user.permissions)

    can_iqc = bool(granted & IQC_PERMS)
    can_nonconformance = bool(granted & NONCONFORMANCE_PERMS)

    if not (can_iqc or can_nonconformance):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    is_supplier = current_user.supplier_id is not None
    response = DashboardTodosResponse()

    if can_iqc:
        # 查詢待審核 IQC (review_status == 'pending')
        iqc_stmt = (
            select(
                IQCRecordORM.id,
                IQCRecordORM.receipt_id,
                IQCRecordORM.internal_lot_id,
                IQCRecordORM.inspection_result,
                IQCRecordORM.review_status,
                IQCRecordORM.created_at,
                MaterialReceiptORM.receipt_no,
                MaterialReceiptORM.supplier_id,
                MaterialReceiptORM.material_id,
                SupplierLotORM.supplier_lot_no,
                InternalMaterialLotORM.internal_lot_no,
                SupplierORM.supplier_code,
                SupplierORM.supplier_name,
                MaterialORM.material_code,
                MaterialORM.material_name,
            )
            .select_from(IQCRecordORM)
            .outerjoin(MaterialReceiptORM, IQCRecordORM.receipt_id == MaterialReceiptORM.id)
            .outerjoin(SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id)
            .outerjoin(SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id)
            .outerjoin(MaterialORM, MaterialReceiptORM.material_id == MaterialORM.id)
            .outerjoin(
                InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id
            )
            .where(IQCRecordORM.review_status == "pending")
        )
        if is_supplier:
            iqc_stmt = iqc_stmt.where(_supplier_iqc_condition(current_user))

        iqc_rows = db.execute(iqc_stmt).all()

        # 收集需要補查的 internal_lot_id（receipt_id 為 None 但有 internal_lot_id）
        internal_lot_ids = {
            row.internal_lot_id
            for row in iqc_rows
            if row.receipt_id is None and row.internal_lot_id is not None
        }
        internal_lots_map: dict[int, InternalMaterialLotORM] = {}
        if internal_lot_ids:
            internal_lots = db.execute(
                select(InternalMaterialLotORM).where(
                    InternalMaterialLotORM.id.in_(internal_lot_ids)
                )
            ).scalars().all()
            internal_lots_map = {lot.id: lot for lot in internal_lots}

        # 從 internal_lots 收集需要補查的 receipt_id 和 supplier_lot_id
        receipt_ids_from_lot = {
            lot.receipt_id
            for lot in internal_lots_map.values()
            if lot.receipt_id is not None
        }
        supplier_lot_ids_from_lot = {
            lot.supplier_lot_id
            for lot in internal_lots_map.values()
            if lot.supplier_lot_id is not None
        }
        receipts_from_lot_map: dict[int, MaterialReceiptORM] = {}
        if receipt_ids_from_lot:
            receipts = db.execute(
                select(MaterialReceiptORM).where(
                    MaterialReceiptORM.id.in_(receipt_ids_from_lot)
                )
            ).scalars().all()
            receipts_from_lot_map = {r.id: r for r in receipts}
        supplier_lots_from_lot_map: dict[int, SupplierLotORM] = {}
        if supplier_lot_ids_from_lot:
            supplier_lots = db.execute(
                select(SupplierLotORM).where(
                    SupplierLotORM.id.in_(supplier_lot_ids_from_lot)
                )
            ).scalars().all()
            supplier_lots_from_lot_map = {sl.id: sl for sl in supplier_lots}

        # 收集所有需要補查的 supplier_id 和 material_id
        supplier_ids = {
            row.supplier_id
            for row in iqc_rows
            if row.supplier_id is not None and row.supplier_code is None
        }
        # 從 internal_lot 的 receipt/supplier_lot 可能新增的 supplier_id
        for lot in internal_lots_map.values():
            if lot.receipt_id and lot.receipt_id in receipts_from_lot_map:
                receipt = receipts_from_lot_map[lot.receipt_id]
                if receipt.supplier_id is not None:
                    supplier_ids.add(receipt.supplier_id)
            if lot.supplier_lot_id and lot.supplier_lot_id in supplier_lots_from_lot_map:
                sl = supplier_lots_from_lot_map[lot.supplier_lot_id]
                if sl.supplier_id is not None:
                    supplier_ids.add(sl.supplier_id)
        suppliers_map: dict[int, SupplierORM] = {}
        if supplier_ids:
            suppliers = db.execute(
                select(SupplierORM).where(SupplierORM.id.in_(supplier_ids))
            ).scalars().all()
            suppliers_map = {s.id: s for s in suppliers}

        material_ids = {
            row.material_id
            for row in iqc_rows
            if row.material_id is not None and row.material_code is None
        }
        # 從 internal_lot 的 receipt/supplier_lot 可能新增的 material_id
        for lot in internal_lots_map.values():
            if lot.receipt_id and lot.receipt_id in receipts_from_lot_map:
                receipt = receipts_from_lot_map[lot.receipt_id]
                if receipt.material_id is not None:
                    material_ids.add(receipt.material_id)
            if lot.supplier_lot_id and lot.supplier_lot_id in supplier_lots_from_lot_map:
                sl = supplier_lots_from_lot_map[lot.supplier_lot_id]
                if sl.material_id is not None:
                    material_ids.add(sl.material_id)
        materials_map: dict[int, MaterialORM] = {}
        if material_ids:
            materials = db.execute(
                select(MaterialORM).where(MaterialORM.id.in_(material_ids))
            ).scalars().all()
            materials_map = {m.id: m for m in materials}

        pending_iqc_items = []
        for row in iqc_rows:
            iqc_id = row.id
            receipt_id = row.receipt_id
            internal_lot_id = row.internal_lot_id
            inspection_result = row.inspection_result
            review_status = row.review_status
            created_at = row.created_at
            receipt_no = row.receipt_no
            supplier_id = row.supplier_id
            material_id = row.material_id
            _supplier_lot_no = row.supplier_lot_no
            internal_lot_no = row.internal_lot_no
            supplier_code = row.supplier_code
            supplier_name = row.supplier_name
            material_code = row.material_code
            material_name = row.material_name

            # 如果有 internal_lot 但沒有 receipt，嘗試從 internal_lot 取得 supplier/material
            if receipt_id is None and internal_lot_id is not None:
                internal_lot = internal_lots_map.get(internal_lot_id)
                if internal_lot:
                    if internal_lot.receipt_id:
                        receipt_from_lot = receipts_from_lot_map.get(internal_lot.receipt_id)
                        if receipt_from_lot:
                            receipt_no = receipt_from_lot.receipt_no
                            supplier_id = receipt_from_lot.supplier_id
                            material_id = receipt_from_lot.material_id
                    elif internal_lot.supplier_lot_id:
                        supplier_lot = supplier_lots_from_lot_map.get(
                            internal_lot.supplier_lot_id
                        )
                        if supplier_lot:
                            supplier_id = supplier_lot.supplier_id
                            material_id = supplier_lot.material_id

            # 取得 supplier/material 資訊
            if supplier_id is not None and supplier_code is None:
                supplier = suppliers_map.get(supplier_id)
                if supplier:
                    supplier_code = supplier.supplier_code
                    supplier_name = supplier.supplier_name
            if material_id is not None and material_code is None:
                material = materials_map.get(material_id)
                if material:
                    material_code = material.material_code
                    material_name = material.material_name

            detail_path = f"/iqc/{iqc_id}"
            pending_iqc_items.append(
                PendingIQCItem(
                    id=iqc_id,
                    internal_lot_no=internal_lot_no,
                    receipt_no=receipt_no,
                    supplier_code=supplier_code,
                    supplier_name=supplier_name,
                    material_code=material_code,
                    material_name=material_name,
                    inspection_result=inspection_result,
                    review_status=review_status,
                    created_at=created_at,
                    detail_path=detail_path,
                )
            )
        response.pending_iqc = pending_iqc_items

    if can_nonconformance:
        # 查詢未結案不合格案件 (status != 'closed')
        nc_stmt = (
            select(
                NonconformanceORM.id,
                NonconformanceORM.case_no,
                NonconformanceORM.title,
                NonconformanceORM.status,
                NonconformanceORM.severity,
                NonconformanceORM.supplier_id,
                NonconformanceORM.material_id,
                NonconformanceORM.found_at,
            )
            .select_from(NonconformanceORM)
            .where(NonconformanceORM.status != "closed")
        )
        if is_supplier:
            nc_stmt = nc_stmt.where(NonconformanceORM.supplier_id == current_user.supplier_id)

        nc_rows = db.execute(nc_stmt).all()

        # 收集所有需要補查的 supplier_id 和 material_id
        nc_supplier_ids = {row[5] for row in nc_rows if row[5] is not None}
        nc_material_ids = {row[6] for row in nc_rows if row[6] is not None}

        nc_suppliers_map: dict[int, SupplierORM] = {}
        if nc_supplier_ids:
            suppliers = db.execute(
                select(SupplierORM).where(SupplierORM.id.in_(nc_supplier_ids))
            ).scalars().all()
            nc_suppliers_map = {s.id: s for s in suppliers}

        nc_materials_map: dict[int, MaterialORM] = {}
        if nc_material_ids:
            materials = db.execute(
                select(MaterialORM).where(MaterialORM.id.in_(nc_material_ids))
            ).scalars().all()
            nc_materials_map = {m.id: m for m in materials}

        open_nc_items = []
        for nc_row in nc_rows:
            nc_id = nc_row[0]
            case_no = nc_row[1]
            title = nc_row[2]
            nc_status = nc_row[3]
            severity = nc_row[4]
            supplier_id = nc_row[5]
            material_id = nc_row[6]
            found_at = nc_row[7]

            supplier_code = None
            supplier_name = None
            material_code = None
            material_name = None

            if supplier_id is not None:
                supplier = nc_suppliers_map.get(supplier_id)
                if supplier:
                    supplier_code = supplier.supplier_code
                    supplier_name = supplier.supplier_name
            if material_id is not None:
                material = nc_materials_map.get(material_id)
                if material:
                    material_code = material.material_code
                    material_name = material.material_name

            detail_path = f"/nonconformances/{nc_id}"
            open_nc_items.append(
                OpenNCItem(
                    id=nc_id,
                    case_no=case_no,
                    title=title,
                    status=nc_status,
                    severity=severity,
                    supplier_code=supplier_code,
                    supplier_name=supplier_name,
                    material_code=material_code,
                    material_name=material_name,
                    found_at=found_at,
                    detail_path=detail_path,
                )
            )
        response.open_nc = open_nc_items

    return response
