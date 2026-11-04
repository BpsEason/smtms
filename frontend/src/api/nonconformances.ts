import { request, requestBlob, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  Nonconformance,
} from "../types";

export async function listNonconformances(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<Nonconformance>>(
    `/api/v1/nonconformances${buildQueryString(params ?? {})}`,
  );
}

export async function getNonconformance(id: number) {
  return request<Nonconformance>(`/api/v1/nonconformances/${id}`);
}

export async function createNonconformance(
  payload: Record<string, unknown>,
) {
  return request<Nonconformance>(`/api/v1/nonconformances`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateNonconformance(
  id: number,
  payload: Record<string, unknown>,
) {
  return request<Nonconformance>(`/api/v1/nonconformances/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function addNonconformanceDisposition(
  id: number,
  payload: Record<string, unknown>,
) {
  return request<Nonconformance>(
    `/api/v1/nonconformances/${id}/dispositions`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function uploadNonconformanceAttachment(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ id: number; original_filename: string }>(
    `/api/v1/nonconformances/${id}/attachments`,
    { method: "POST", body: form },
  );
}

export async function deleteNonconformanceAttachment(
  id: number,
  attachmentId: number,
) {
  return request<void>(
    `/api/v1/nonconformances/${id}/attachments/${attachmentId}`,
    { method: "DELETE" },
  );
}

export async function downloadNonconformanceAttachment(
  id: number,
  attachmentId: number,
) {
  return requestBlob(
    `/api/v1/nonconformances/${id}/attachments/${attachmentId}/download`,
    {},
    "附件下載失敗",
  );
}
