import { request, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  InternalLot,
} from "../types";

export async function listInternalLots(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<InternalLot>>(
    `/api/v1/internal-lots${buildQueryString(params ?? {})}`,
  );
}

export async function getInternalLot(internalLotId: number) {
  return request<InternalLot>(`/api/v1/internal-lots/${internalLotId}`);
}
