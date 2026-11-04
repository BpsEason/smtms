import { request, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  Receipt,
  ReceiptCreatePayload,
  ReceiptTrace,
  InternalLot,
  InternalLotCreatePayload,
} from "../types";

export async function listReceipts(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<Receipt>>(
    `/api/v1/receipts${buildQueryString(params ?? {})}`,
  );
}

export async function getReceipt(receiptId: number) {
  return request<Receipt>(`/api/v1/receipts/${receiptId}`);
}

export async function createReceipt(payload: ReceiptCreatePayload) {
  return request<Receipt>(`/api/v1/receipts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getReceiptTrace(receiptId: number) {
  return request<ReceiptTrace>(`/api/v1/receipts/${receiptId}/trace`);
}

export async function splitReceipt(
  receiptId: number,
  payload: InternalLotCreatePayload,
) {
  return request<InternalLot>(`/api/v1/receipts/${receiptId}/internal-lots`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}