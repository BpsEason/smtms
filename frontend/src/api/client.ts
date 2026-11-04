const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_KEY = "smtms_token";

export class ApiError extends Error {
  status: number;
  details: string;
  errors?: Record<string, string[]>;

  constructor(
    status: number,
    message: string,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = message;
    this.errors = errors;
  }
}

export function readToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

function buildQueryString(
  params: Record<string, string | number | undefined | null>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const token = readToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    !headers.has("Content-Type") &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = await response.text();
  let data: unknown = null;
  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch {
      data = { detail: payload };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && !path.endsWith("/auth/login")) {
      clearToken();
      window.dispatchEvent(new Event("smtms:unauthorized"));
    }

    let detail = "Request failed";
    let errors: Record<string, string[]> | undefined;

    if (data && typeof data === "object") {
      if (
        response.status === 422 &&
        "errors" in data &&
        data.errors &&
        typeof data.errors === "object"
      ) {
        errors = data.errors as Record<string, string[]>;
        const messages = Object.entries(errors)
          .flatMap(([, fieldErrors]) => fieldErrors)
          .join("; ");
        detail = messages || "欄位驗證失敗";
      }
      else if ("detail" in data && typeof data.detail === "string") {
        detail = data.detail;
      }
      else if ("message" in data && typeof data.message === "string") {
        detail = data.message;
      }
      else if ("detail" in data && Array.isArray(data.detail)) {
        detail = data.detail
          .map((item: unknown) => {
            if (
              item &&
              typeof item === "object" &&
              "msg" in item &&
              typeof item.msg === "string"
            ) {
              return item.msg;
            }
            return "Validation failed";
          })
          .join("; ");
      }
    }

    if (detail === "Request failed") {
      switch (response.status) {
        case 401:
          detail = "未授權，請重新登入";
          break;
        case 403:
          detail = "您沒有權限執行此操作";
          break;
        case 404:
          detail = "要求的資源不存在";
          break;
        case 422:
          detail = "欄位驗證失敗";
          break;
        case 500:
          detail = "伺服器內部錯誤，請稍後再試";
          break;
        default:
          detail = `請求失敗 (${response.status})`;
      }
    }

    throw new ApiError(response.status, detail, errors);
  }

  return (data ?? undefined) as T;
}

async function requestBlob(
  path: string,
  init: RequestInit = {},
  errorMessage = "Request failed",
): Promise<Blob> {
  const headers = new Headers(init.headers ?? {});
  const token = readToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && token && !path.endsWith("/auth/login")) {
      clearToken();
      window.dispatchEvent(new Event("smtms:unauthorized"));
    }
    throw new ApiError(response.status, errorMessage);
  }

  return response.blob();
}

export { buildQueryString, request, requestBlob };
