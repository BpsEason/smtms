import { request } from "./client";
import type { AdminUser, InternalUserCreatePayload } from "../types";

export async function listUsers() {
  return request<AdminUser[]>(`/api/v1/users`);
}

export async function createUser(payload: InternalUserCreatePayload) {
  return request<AdminUser>(`/api/v1/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function setUserRoles(userId: number, roleIds: number[]) {
  return request<AdminUser>(`/api/v1/users/${userId}/roles`, {
    method: "PUT",
    body: JSON.stringify({ role_ids: roleIds }),
  });
}
