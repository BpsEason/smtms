import { buildQueryString, request } from "./client";
import type { DashboardSummary, DashboardTodos, QualityTrendResponse } from "../types";

export async function getDashboardSummary() {
  return request<DashboardSummary>("/api/v1/dashboard/summary");
}

export async function getDashboardTodos() {
  return request<DashboardTodos>("/api/v1/dashboard/todos");
}

export async function getQualityTrend(
  dateFrom?: string,
  dateTo?: string,
): Promise<QualityTrendResponse> {
  return request<QualityTrendResponse>(
    `/api/v1/dashboard/quality-trend${buildQueryString({ date_from: dateFrom, date_to: dateTo })}`,
  );
}
