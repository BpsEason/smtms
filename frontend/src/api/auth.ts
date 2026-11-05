import { request } from "./client";
import type { UserProfile } from "../types";

export async function login(username: string, password: string) {
  const data = await request<{
    access_token: string;
    refresh_token?: string;
    token_type: string;
  }>(`/api/v1/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (data.refresh_token) {
    localStorage.setItem("smtms_refresh_token", data.refresh_token);
  }
  return data;
}

export async function logout() {
  localStorage.removeItem("smtms_refresh_token");
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
