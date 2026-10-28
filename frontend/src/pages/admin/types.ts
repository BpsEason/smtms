import type { AdminUser, PermissionItem, Role, UserProfile } from "../../types";

export type { AdminUser, PermissionItem, Role, UserProfile };

export const PORTAL_PERMISSION = "suppliers:read";

// 輔助函數
export function optional(
  value: FormDataEntryValue | null | string | undefined,
) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

export function permissionLabel(permission: PermissionItem) {
  const labels: Record<string, string> = {
    "suppliers:read": "查看供應商資料",
    "suppliers:write": "新增／修改供應商資料",
    "materials:read": "查看物料與批號",
    "materials:write": "新增／修改物料與批號",
    "receipts:read": "查看收料紀錄",
    "receipts:write": "建立收料紀錄",
    "supplier-lots:write": "建立供應商批號",
    "iqc:read": "查看進料檢驗（IQC）",
    "iqc:write": "建立／修改進料檢驗（IQC）",
    "quality:review": "審核進料檢驗",
    "quality:approve": "核准進料檢驗",
    "quality:return": "退回進料檢驗",
    "nonconformance:read": "查看品質異常",
    "nonconformance:write": "新增／修改品質異常",
    "users:manage": "管理使用者與系統設定",
  };
  const label = labels[permission.code];
  if (label) return label;

  const fallback = permission.name.replace(/^Seed permission:\s*/i, "").trim();
  return fallback || permission.code;
}

export function permissionDescription(permission: PermissionItem) {
  const description = permission.description?.trim();
  if (!description || /^Seed permission:/i.test(description)) return null;
  return description;
}

export function message(error: unknown) {
  return error instanceof Error && "details" in error
    ? `操作失敗：${(error as { details: string }).details}`
    : "請求失敗，請確認網路連線後再試一次。";
}
