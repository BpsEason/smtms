import { request, requestBlob, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  Supplier,
  SupplierCreatePayload,
  SupplierUpdatePayload,
  SupplierDocument,
  SupplierDocumentPayload,
  SupplierDocumentAttachment,
  SupplierImportPreview,
  SupplierImportResult,
  SupplierMaterialCreatePayload,
} from "../types";

export async function listSuppliers(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<Supplier>>(
    `/api/v1/suppliers${buildQueryString(params ?? {})}`,
  );
}

export async function createSupplier(payload: SupplierCreatePayload) {
  return request<Supplier>(`/api/v1/suppliers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSupplier(
  supplierId: number,
  payload: SupplierUpdatePayload,
) {
  return request<Supplier>(`/api/v1/suppliers/${supplierId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listSupplierDocuments(supplierId: number) {
  return request<SupplierDocument[]>(
    `/api/v1/suppliers/${supplierId}/documents`,
  );
}

export async function getSupplierDocument(
  supplierId: number,
  documentId: number,
) {
  return request<SupplierDocument>(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}`,
  );
}

export async function createSupplierDocument(
  supplierId: number,
  payload: SupplierDocumentPayload,
) {
  return request<SupplierDocument>(
    `/api/v1/suppliers/${supplierId}/documents`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateSupplierDocument(
  supplierId: number,
  documentId: number,
  payload: Partial<SupplierDocumentPayload>,
) {
  return request<SupplierDocument>(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteSupplierDocument(
  supplierId: number,
  documentId: number,
) {
  return request<void>(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}`,
    { method: "DELETE" },
  );
}

export async function listSupplierDocumentAttachments(
  supplierId: number,
  documentId: number,
) {
  return request<SupplierDocumentAttachment[]>(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}/attachments`,
  );
}

export async function uploadSupplierDocumentAttachment(
  supplierId: number,
  documentId: number,
  file: File,
) {
  const form = new FormData();
  form.append("file", file);
  return request<SupplierDocumentAttachment>(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}/attachments`,
    {
      method: "POST",
      body: form,
    },
  );
}

export async function deleteSupplierDocumentAttachment(
  supplierId: number,
  documentId: number,
  attachmentId: number,
) {
  return request<void>(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}/attachments/${attachmentId}`,
    { method: "DELETE" },
  );
}

export async function downloadSupplierDocumentAttachment(
  supplierId: number,
  documentId: number,
  attachmentId: number,
) {
  return requestBlob(
    `/api/v1/suppliers/${supplierId}/documents/${documentId}/attachments/${attachmentId}/download`,
    {},
    "無法下載附件，請確認權限或稍後重試。",
  );
}

export async function supplierImportTemplate() {
  return requestBlob(`/api/v1/suppliers/import/template`, {}, "無法下載匯入範本，請稍後再試。");
}

export async function previewSupplierImport(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<SupplierImportPreview>(
    `/api/v1/suppliers/import/preview`,
    { method: "POST", body: form },
  );
}

export async function confirmSupplierImport(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<SupplierImportResult>(
    `/api/v1/suppliers/import/confirm`,
    { method: "POST", body: form },
  );
}

export async function createSupplierMaterial(
  supplierId: number,
  payload: SupplierMaterialCreatePayload,
) {
  return request(`/api/v1/suppliers/${supplierId}/materials`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
