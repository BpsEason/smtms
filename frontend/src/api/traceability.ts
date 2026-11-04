import { request, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  TraceabilityReceipt,
} from "../types";

export async function searchTraceability(
  params: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<TraceabilityReceipt>>(
    `/api/v1/traceability${buildQueryString(params)}`,
  );
}
