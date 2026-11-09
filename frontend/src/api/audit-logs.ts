import { request, requestBlob, buildQueryString } from "./client";
import type { AuditLog, PaginatedResponse } from "../types";

export async function listAuditLogs(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<AuditLog>>(
    `/api/v1/audit-logs${buildQueryString(params ?? {})}`,
  );
}

export async function exportAuditLogs(
  params?: Record<string, string | number | undefined | null>,
) {
  return requestBlob(
    `/api/v1/audit-logs/export.csv${buildQueryString(params ?? {})}`,
    {},
    "稽核紀錄匯出失敗",
  );
}
