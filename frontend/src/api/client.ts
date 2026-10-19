import type {
  AdminUser,
  IQCCreatePayload,
  IQCRecord,
  InternalLot,
  InternalLotCreatePayload,
  Material,
  MaterialCreatePayload,
  MaterialUpdatePayload,
  PaginatedResponse,
  PermissionItem,
  Receipt,
  ReceiptCreatePayload,
  ReceiptTrace,
  Role,
  Supplier,
  SupplierCreatePayload,
  SupplierLotCreatePayload,
  SupplierMaterialCreatePayload,
  SupplierUpdatePayload,
  SupplierImportPreview,
  SupplierImportResult,
  SupplierLot,
  UserProfile,
} from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_KEY = "smtms_token";

export class ApiError extends Error {
  status: number;
  details: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = message;
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
    const payloadDetail =
      data && typeof data === "object" && "detail" in data
        ? data.detail
        : undefined;
    const detail =
      typeof payloadDetail === "string"
        ? payloadDetail
        : Array.isArray(payloadDetail)
          ? payloadDetail
              .map((item) =>
                item &&
                typeof item === "object" &&
                "msg" in item &&
                typeof item.msg === "string"
                  ? item.msg
                  : "Validation failed",
              )
              .join("; ")
          : "Request failed";
    throw new ApiError(response.status, detail);
  }

  return (data ?? undefined) as T;
}

export const api = {
  login: async (username: string, password: string) =>
    request<{ access_token: string; token_type: string }>(
      `/api/v1/auth/login`,
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
    ),

  logout: async () =>
    request<{ message: string }>(`/api/v1/auth/logout`, { method: "POST" }),

  getProfile: async () => request<UserProfile>(`/api/v1/auth/me`),

  listSuppliers: async (
    params?: Record<string, string | number | undefined | null>,
  ) =>
    request<PaginatedResponse<Supplier>>(
      `/api/v1/suppliers${buildQueryString(params ?? {})}`,
    ),

  createSupplier: async (payload: SupplierCreatePayload) =>
    request<Supplier>(`/api/v1/suppliers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSupplier: async (supplierId: number, payload: SupplierUpdatePayload) =>
    request<Supplier>(`/api/v1/suppliers/${supplierId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listMaterials: async (
    params?: Record<string, string | number | undefined | null>,
  ) =>
    request<PaginatedResponse<Material>>(
      `/api/v1/materials${buildQueryString(params ?? {})}`,
    ),

  createMaterial: async (payload: MaterialCreatePayload) =>
    request<Material>(`/api/v1/materials`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateMaterial: async (materialId: number, payload: MaterialUpdatePayload) =>
    request<Material>(`/api/v1/materials/${materialId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listReceipts: async (
    params?: Record<string, string | number | undefined | null>,
  ) =>
    request<PaginatedResponse<Receipt>>(
      `/api/v1/receipts${buildQueryString(params ?? {})}`,
    ),

  getReceipt: async (receiptId: number) =>
    request<Receipt>(`/api/v1/receipts/${receiptId}`),

  createReceipt: async (payload: ReceiptCreatePayload) =>
    request<Receipt>(`/api/v1/receipts`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getReceiptTrace: async (receiptId: number) =>
    request<ReceiptTrace>(`/api/v1/receipts/${receiptId}/trace`),

  createSupplierMaterial: async (
    supplierId: number,
    payload: SupplierMaterialCreatePayload,
  ) =>
    request(`/api/v1/suppliers/${supplierId}/materials`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listSupplierLots: async (
    params?: Record<string, string | number | undefined | null>,
  ) =>
    request<PaginatedResponse<SupplierLot>>(
      `/api/v1/supplier-lots${buildQueryString(params ?? {})}`,
    ),

  createSupplierLot: async (payload: SupplierLotCreatePayload) =>
    request<SupplierLot>(`/api/v1/supplier-lots`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listInternalLots: async (
    params?: Record<string, string | number | undefined | null>,
  ) =>
    request<PaginatedResponse<InternalLot>>(
      `/api/v1/internal-lots${buildQueryString(params ?? {})}`,
    ),

  getInternalLot: async (internalLotId: number) =>
    request<InternalLot>(`/api/v1/internal-lots/${internalLotId}`),

  splitReceipt: async (receiptId: number, payload: InternalLotCreatePayload) =>
    request<InternalLot>(`/api/v1/receipts/${receiptId}/internal-lots`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listIQCRecords: async (
    params?: Record<string, string | number | undefined | null>,
  ) =>
    request<PaginatedResponse<IQCRecord>>(
      `/api/v1/iqc${buildQueryString(params ?? {})}`,
    ),

  createIQC: async (payload: IQCCreatePayload) =>
    request<IQCRecord>(`/api/v1/iqc`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateIQC: async (iqcId: number, payload: Record<string, unknown>) =>
    request<IQCRecord>(`/api/v1/iqc/${iqcId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  changePassword: async (currentPassword: string, newPassword: string) =>
    request<{ message: string }>(`/api/v1/auth/change-password`, {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),

  supplierImportTemplate: async () => {
    const headers = new Headers();
    const token = readToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(
      `${API_BASE_URL}/api/v1/suppliers/import/template`,
      { headers },
    );
    if (!response.ok)
      throw new ApiError(response.status, "無法下載匯入範本，請稍後再試。");
    return response.blob();
  },

  previewSupplierImport: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<SupplierImportPreview>(`/api/v1/suppliers/import/preview`, {
      method: "POST",
      body: form,
    });
  },

  confirmSupplierImport: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<SupplierImportResult>(`/api/v1/suppliers/import/confirm`, {
      method: "POST",
      body: form,
    });
  },

  listRoles: async () => request<Role[]>(`/api/v1/roles`),

  createRole: async (payload: { name: string; description?: string }) =>
    request<Role>(`/api/v1/roles`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRole: async (
    roleId: number,
    payload: { name?: string; description?: string | null },
  ) =>
    request<Role>(`/api/v1/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteRole: async (roleId: number) =>
    request<void>(`/api/v1/roles/${roleId}`, { method: "DELETE" }),

  setRolePermissions: async (roleId: number, permissionIds: number[]) =>
    request<Role>(`/api/v1/roles/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permission_ids: permissionIds }),
    }),

  listPermissions: async () => request<PermissionItem[]>(`/api/v1/permissions`),

  listUsers: async () => request<AdminUser[]>(`/api/v1/users`),

  setUserRoles: async (userId: number, roleIds: number[]) =>
    request<AdminUser>(`/api/v1/users/${userId}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids: roleIds }),
    }),
};
