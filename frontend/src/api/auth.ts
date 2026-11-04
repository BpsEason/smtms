import { request } from "./client";
import type { UserProfile } from "../types";

export async function login(username: string, password: string) {
  return request<{ access_token: string; token_type: string }>(
    `/api/v1/auth/login`,
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
  );
}

export async function logout() {
  return request<{ message: string }>(`/api/v1/auth/logout`, {
    method: "POST",
  });
}

export async function getProfile() {
  return request<UserProfile>(`/api/v1/auth/me`);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  return request<{ message: string }>(`/api/v1/auth/change-password`, {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}
