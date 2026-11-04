import { request } from "./client";
import type { Role, PermissionItem } from "../types";

export async function listRoles() {
  return request<Role[]>(`/api/v1/roles`);
}

export async function createRole(payload: { name: string; description?: string }) {
  return request<Role>(`/api/v1/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRole(
  roleId: number,
  payload: { name?: string; description?: string | null },
) {
  return request<Role>(`/api/v1/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteRole(roleId: number) {
  return request<void>(`/api/v1/roles/${roleId}`, { method: "DELETE" });
}

export async function setRolePermissions(
  roleId: number,
  permissionIds: number[],
) {
  return request<Role>(`/api/v1/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_ids: permissionIds }),
  });
}

export async function listPermissions() {
  return request<PermissionItem[]>(`/api/v1/permissions`);
}
