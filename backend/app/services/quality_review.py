from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    QualityReviewORM,
)
from app.models.user import UserORM
from app.schemas.catalog import QualityReviewResponse

REVIEWABLE_STATUSES = {"pending", "returned"}


def lock_iqc_record_for_review(db: Session, iqc_id: int) -> IQCRecordORM:
    """Lock the IQC row and reject decisions that are no longer allowed.

    The locking read (SELECT ... FOR UPDATE) makes concurrent sign-offs of the
    same record serialise: the losing transaction re-reads the committed
    review_status and is rejected with 409 instead of appending a second
    decision for an already-finalised record.
    """
    record = db.execute(
        select(IQCRecordORM).where(IQCRecordORM.id == iqc_id).with_for_update()
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IQC record not found")
    if record.review_status not in REVIEWABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "IQC record is not awaiting sign-off: "
                f"current review status is '{record.review_status}'"
            ),
        )
    return record


def record_review_decision(
    db: Session,
    record: IQCRecordORM,
    *,
    current_user: AuthenticatedUser,
    decision: str,
    decision_note: str | None,
    reason: str | None,
) -> QualityReviewORM:
    normalized = decision.lower()
    if normalized not in {"approved", "returned", "rejected"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported review decision",
        )
    if normalized in {"returned", "rejected"} and not (reason and reason.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Return and reject decisions require a reason",
        )

    review = QualityReviewORM(
        iqc_record_id=record.id,
        review_status=normalized,
        decision=normalized,
        reviewed_by_user_id=current_user.id,
        decision_note=decision_note.strip() if decision_note else None,
        reason=reason.strip() if reason else None,
        reviewed_at=datetime.utcnow(),
    )
    record.review_status = normalized
    record.reviewed_by_user_id = current_user.id
    record.reviewed_at = review.reviewed_at
    record.review_decision_note = review.decision_note

    # 當審核被拒絕時，更新關聯的內部批次狀態
    if normalized == "rejected" and record.internal_lot is not None:
        record.internal_lot.lot_status = "rejected"

    db.add(review)
    return review


def review_responses(
    db: Session,
    reviews: list[QualityReviewORM],
    *,
    fallback_username: str | None = None,
) -> list[QualityReviewResponse]:
    """Serialise review history rows and resolve the signing operator name."""
    reviewer_ids = {
        review.reviewed_by_user_id for review in reviews if review.reviewed_by_user_id is not None
    }
    usernames: dict[int, str] = {}
    if reviewer_ids:
        usernames = dict(
            db.execute(
                select(UserORM.id, UserORM.username).where(UserORM.id.in_(reviewer_ids))
            ).all()
        )
    payloads: list[QualityReviewResponse] = []
    for review in reviews:
        payload = QualityReviewResponse.model_validate(review)
        payload.reviewed_by_username = (
            usernames.get(review.reviewed_by_user_id or -1) or fallback_username
        )
        payloads.append(payload)
    return payloads


def apply_iqc_to_lot(
    lot: InternalMaterialLotORM | None, inspection_result: str | None, release_status: str | None
) -> None:
    if lot is None or inspection_result is None or release_status is None:
        return
    if inspection_result == "passed" and release_status == "released":
        lot.lot_status = "available"
    elif inspection_result == "pending" and release_status == "hold":
        lot.lot_status = "quarantine"
    elif inspection_result == "failed" and release_status == "rejected":
        lot.lot_status = "rejected"
    elif inspection_result == "passed" and release_status != "released":
        lot.lot_status = "quarantine"
    elif inspection_result == "failed" and release_status != "rejected":
        lot.lot_status = "rejected"
    elif inspection_result == "pending" and release_status != "hold":
        lot.lot_status = "quarantine"


def relationship_status_for_iqc(inspection_result: str, release_status: str) -> str:
    if inspection_result == "passed":
        if release_status != "released":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passed inspection requires release_status='released'",
            )
        return "available"
    if inspection_result == "pending":
        if release_status != "hold":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending inspection requires release_status='hold'",
            )
        return "quarantine"
    if inspection_result == "failed":
        if release_status != "rejected":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed inspection requires release_status='rejected'",
            )
        return "rejected"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported inspection_result value",
    )
