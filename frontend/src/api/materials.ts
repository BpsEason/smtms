import { request, buildQueryString } from "./client";
import type {
  PaginatedResponse,
  Material,
  MaterialCreatePayload,
  MaterialUpdatePayload,
} from "../types";

export async function listMaterials(
  params?: Record<string, string | number | undefined | null>,
) {
  return request<PaginatedResponse<Material>>(
    `/api/v1/materials${buildQueryString(params ?? {})}`,
  );
}

export async function createMaterial(payload: MaterialCreatePayload) {
  return request<Material>(`/api/v1/materials`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMaterial(
  materialId: number,
  payload: MaterialUpdatePayload,
) {
  return request<Material>(`/api/v1/materials/${materialId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
