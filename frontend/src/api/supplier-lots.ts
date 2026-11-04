import { request, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  SupplierLot,
  SupplierLotCreatePayload,
} from "../types";

export async function listSupplierLots(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<SupplierLot>>(
    `/api/v1/supplier-lots${buildQueryString(params ?? {})}`,
  );
}

export async function createSupplierLot(payload: SupplierLotCreatePayload) {
  return request<SupplierLot>(`/api/v1/supplier-lots`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
