from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, require_any_permission
from app.db.session import get_db
from app.models.quality import IQCRecordORM, QualityReviewORM
from app.schemas.catalog import (
    PaginatedResponse,
    QualityReviewDecision,
    QualityReviewResponse,
)
from app.services.quality_review import (
    lock_iqc_record_for_review,
    record_review_decision,
    review_responses,
)
from .iqc import get_iqc_record

router = APIRouter()


def _ensure_iqc_review_access(
    db: Session,
    current_user: AuthenticatedUser,
    record: IQCRecordORM,
) -> None:
    # Supplier portal users may inspect their own IQC records, but sign-off is
    # an internal QA action even if a supplier role is accidentally misconfigured.
    if current_user.supplier_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal QA users only")


@router.get("/iqc/{iqc_id}/reviews", response_model=PaginatedResponse[QualityReviewResponse])
def list_iqc_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None, max_length=20),
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve", "quality:return")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    statement = select(QualityReviewORM).where(QualityReviewORM.iqc_record_id == record.id)
    count_statement = (
        select(func.count())
        .select_from(QualityReviewORM)
        .where(QualityReviewORM.iqc_record_id == record.id)
    )
    if status:
        statement = statement.where(QualityReviewORM.review_status == status)
        count_statement = count_statement.where(QualityReviewORM.review_status == status)

    total = db.scalar(count_statement) or 0
    rows = db.scalars(
        statement.order_by(QualityReviewORM.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse[QualityReviewResponse](
        items=review_responses(db, list(rows)),
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/iqc/{iqc_id}/reviews/approve", response_model=QualityReviewResponse)
def approve_iqc_review(
    payload: QualityReviewDecision,
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    record = lock_iqc_record_for_review(db, record.id)
    review = record_review_decision(
        db,
        record,
        current_user=current_user,
        decision="approved",
        decision_note=payload.decision_note,
        reason=payload.reason,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review conflict") from exc
    db.refresh(review)
    return review_responses(db, [review], fallback_username=current_user.username)[0]


@router.post("/iqc/{iqc_id}/reviews/return", response_model=QualityReviewResponse)
def return_iqc_review(
    payload: QualityReviewDecision,
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    record = lock_iqc_record_for_review(db, record.id)
    review = record_review_decision(
        db,
        record,
        current_user=current_user,
        decision="returned",
        decision_note=payload.decision_note,
        reason=payload.reason,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review conflict") from exc
    db.refresh(review)
    return review_responses(db, [review], fallback_username=current_user.username)[0]


@router.post("/iqc/{iqc_id}/reviews/reject", response_model=QualityReviewResponse)
def reject_iqc_review(
    payload: QualityReviewDecision,
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:reject")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    record = lock_iqc_record_for_review(db, record.id)
    review = record_review_decision(
        db,
        record,
        current_user=current_user,
        decision="rejected",
        decision_note=payload.decision_note,
        reason=payload.reason,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review conflict") from exc
    db.refresh(review)
    return review_responses(db, [review], fallback_username=current_user.username)[0]


@router.get("/quality-reviews", response_model=PaginatedResponse[QualityReviewResponse])
def list_quality_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    review_status: str | None = Query(default=None, max_length=20),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve", "quality:return")
    ),
):
    if current_user.supplier_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal QA users only")
    statement = select(QualityReviewORM)
    count_statement = select(func.count()).select_from(QualityReviewORM)
    if review_status:
        statement = statement.where(QualityReviewORM.review_status == review_status)
        count_statement = count_statement.where(QualityReviewORM.review_status == review_status)
    total = db.scalar(count_statement) or 0
    rows = db.scalars(
        statement.order_by(QualityReviewORM.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse[QualityReviewResponse](
        items=review_responses(db, list(rows)),
        total=total,
        page=page,
        page_size=page_size,
    )
