const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_KEY = "smtms_token";

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
}

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

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    token &&
    !path.endsWith("/auth/login") &&
    !path.endsWith("/auth/refresh")
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshResponse = await fetch(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refresh_token: localStorage.getItem("smtms_refresh_token"),
            }),
          },
        );

        if (!refreshResponse.ok) throw new Error("Refresh failed");

        const data = await refreshResponse.json();
        saveToken(data.access_token);
        localStorage.setItem("smtms_refresh_token", data.refresh_token);
        isRefreshing = false;
        onRefreshed(data.access_token);
      } catch (err) {
        isRefreshing = false;
        clearToken();
        localStorage.removeItem("smtms_refresh_token");
        window.dispatchEvent(new Event("smtms:unauthorized"));
        // Do not throw here so the original 401 response proceeds down to standard response parsing and error mapping
      }
    } else {
      const retryOriginalRequest = new Promise((resolve) => {
        subscribeTokenRefresh((newToken: string) => {
          headers.set("Authorization", `Bearer ${newToken}`);
          resolve(fetch(`${API_BASE_URL}${path}`, { ...init, headers }));
        });
      });

      response = (await retryOriginalRequest) as Response;
    }
  }

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
      } else if ("detail" in data && typeof data.detail === "string") {
        detail = data.detail;
      } else if ("message" in data && typeof data.message === "string") {
        detail = data.message;
      } else if ("detail" in data && Array.isArray(data.detail)) {
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

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    token &&
    !path.endsWith("/auth/login") &&
    !path.endsWith("/auth/refresh")
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshResponse = await fetch(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refresh_token: localStorage.getItem("smtms_refresh_token"),
            }),
          },
        );

        if (!refreshResponse.ok) throw new Error("Refresh failed");

        const data = await refreshResponse.json();
        saveToken(data.access_token);
        localStorage.setItem("smtms_refresh_token", data.refresh_token);
        isRefreshing = false;
        onRefreshed(data.access_token);
      } catch (err) {
        isRefreshing = false;
        clearToken();
        localStorage.removeItem("smtms_refresh_token");
        window.dispatchEvent(new Event("smtms:unauthorized"));
        // Do not throw here so original 401 response proceeds to check !response.ok with errorMessage
      }
    } else {
      const retryOriginalRequest = new Promise((resolve) => {
        subscribeTokenRefresh((newToken: string) => {
          headers.set("Authorization", `Bearer ${newToken}`);
          resolve(fetch(`${API_BASE_URL}${path}`, { ...init, headers }));
        });
      });

      response = (await retryOriginalRequest) as Response;
    }
  }

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
