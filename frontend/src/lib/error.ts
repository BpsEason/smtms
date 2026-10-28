import { ApiError } from "../api/client";

/**
 * 統一的錯誤訊息格式化函數
 * 將各種錯誤類型轉換為使用者友好的訊息
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.details;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "發生未知錯誤，請稍後再試。";
}

/**
 * 取得驗證錯誤（如果有的話）
 */
export function getValidationErrors(
  error: unknown,
): Record<string, string[]> | undefined {
  if (error instanceof ApiError) {
    return error.errors;
  }
  return undefined;
}

/**
 * 檢查錯誤是否為特定的HTTP狀態碼
 */
export function isHttpError(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}
