import { request, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  IQCRecord,
  IQCCreatePayload,
  IQCUpdatePayload,
  QualityReview,
  QualityReviewDecisionPayload,
} from "../types";

export async function listIQCRecords(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<IQCRecord>>(
    `/api/v1/iqc${buildQueryString(params ?? {})}`,
  );
}

export async function createIQC(payload: IQCCreatePayload) {
  return request<IQCRecord>(`/api/v1/iqc`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateIQC(
  iqcId: number,
  payload: IQCUpdatePayload,
) {
  return request<IQCRecord>(`/api/v1/iqc/${iqcId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listQualityReviews(
  iqcId: number,
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<QualityReview>>(
    `/api/v1/iqc/${iqcId}/reviews${buildQueryString(params ?? {})}`,
  );
}

export async function approveQualityReview(
  iqcId: number,
  payload: QualityReviewDecisionPayload,
) {
  return request<QualityReview>(`/api/v1/iqc/${iqcId}/reviews/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnQualityReview(
  iqcId: number,
  payload: QualityReviewDecisionPayload,
) {
  return request<QualityReview>(`/api/v1/iqc/${iqcId}/reviews/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
