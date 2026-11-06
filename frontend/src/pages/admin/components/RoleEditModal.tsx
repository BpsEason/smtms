import { useEffect, useState } from "react";
import { Modal } from "antd";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  buttonClass,
  secondaryButtonClass,
  FormField,
  inputClass,
  EmptyState,
} from "../../../components/ui";
import { permissionLabel, permissionDescription, PORTAL_PERMISSION } from "../types";
import type { Role, PermissionItem } from "../types";

const roleSchema = z.object({
  name: z.string().min(1, "角色名稱為必填").max(80, "角色名稱最多80字元"),
  description: z.string().max(255, "角色說明最多255字元").optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

export interface RoleEditSavePayload {
  name: string;
  description?: string | null;
  permissionIds: number[];
  nameChanged: boolean;
  permissionsChanged: boolean;
}

interface RoleEditModalProps {
  role: Role | null;
  permissions: PermissionItem[];
  busy: boolean;
  onSave: (payload: RoleEditSavePayload) => void | Promise<void>;
  onCancel: () => void;
}

export function RoleEditModal({
  role,
  permissions,
  busy,
  onSave,
  onCancel,
}: RoleEditModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", description: "" },
  });

  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const open = Boolean(role);

  useEffect(() => {
    if (!role) return;
    reset({
      name: role.name,
      description: role.description ?? "",
    });
    setSelectedPermissionIds(
      permissions
        .filter((permission) => role.permissions.includes(permission.code))
        .map((permission) => permission.id),
    );
  }, [role, permissions, reset]);

  const permissionGroups = permissions.reduce<Record<string, PermissionItem[]>>(
    (groups, permission) => {
      const prefix = permission.code.split(":", 1)[0];
      const titles: Record<string, string> = {
        suppliers: "供應商資料",
        materials: "物料與批號",
        receipts: "收料作業",
        iqc: "進料檢驗（IQC）",
        "supplier-lots": "供應商批號",
        quality: "品保簽核",
        nonconformance: "品質異常",
        users: "使用者與系統設定",
      };
      const title = titles[prefix] ?? "其他已設定權限";
      (groups[title] ??= []).push(permission);
      return groups;
    },
    {},
  );

  const originalPermissionIds = role
    ? permissions
        .filter((permission) => role.permissions.includes(permission.code))
        .map((permission) => permission.id)
    : [];
  const permissionsChanged =
    selectedPermissionIds.length !== originalPermissionIds.length ||
    selectedPermissionIds.some((id) => !originalPermissionIds.includes(id));

  const handlePermissionChange = (permissionId: number, checked: boolean) => {
    setSelectedPermissionIds((current) =>
      checked ? [...current, permissionId] : current.filter((id) => id !== permissionId),
    );
  };

  const onSubmit = handleSubmit((data) => {
    if (!role) return;
    const name = data.name.trim();
    const description = data.description?.trim() || null;
    const nameChanged =
      name !== role.name || description !== (role.description ?? null);
    void onSave({
      name,
      description,
      permissionIds: selectedPermissionIds,
      nameChanged,
      permissionsChanged,
    });
  });

  const values = watch();
  const dirty =
    (role &&
      (values.name.trim() !== role.name ||
        (values.description?.trim() || null) !== (role.description ?? null))) ||
    permissionsChanged;

  return (
    <Modal
      open={open}
      title={role ? `編輯角色：${role.name}` : "編輯角色"}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
      maskClosable={!busy}
      closable={!busy}
      width={860}
    >
      {role && (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="角色名稱">
              <input
                {...register("name")}
                className={inputClass}
                disabled={role.is_system || busy}
              />
              {errors.name && (
                <span className="text-sm text-red-500">{errors.name.message}</span>
              )}
            </FormField>
            <FormField label="角色說明">
              <input
                {...register("description")}
                className={inputClass}
                disabled={busy}
              />
              {errors.description && (
                <span className="text-sm text-red-500">{errors.description.message}</span>
              )}
            </FormField>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">權限設定</p>
            <p className="mb-3 text-xs text-slate-500">
              {role.is_system
                ? "供應商入口角色為系統角色，僅能擁有供應商讀取權限。"
                : "勾選要指派給此角色的權限。儲存時由伺服器檢查角色限制及管理員保護規則。"}
            </p>
            {permissions.length === 0 ? (
              <EmptyState title="目前沒有可指派的權限" />
            ) : (
              <div className="max-h-[42vh] space-y-4 overflow-y-auto pr-1">
                {Object.entries(permissionGroups).map(([group, items]) => (
                  <fieldset key={group} className="rounded-md border border-slate-200 p-4">
                    <legend className="px-1 text-sm font-semibold text-slate-900">{group}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {items.map((permission) => {
                        const locked =
                          role.is_system && permission.code !== PORTAL_PERMISSION;
                        return (
                          <label
                            key={permission.id}
                            className="flex items-start gap-3 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              aria-label={permissionLabel(permission)}
                              checked={selectedPermissionIds.includes(permission.id)}
                              disabled={locked || busy}
                              onChange={(event) =>
                                handlePermissionChange(permission.id, event.target.checked)
                              }
                            />
                            <span>
                              <span className="block font-medium text-slate-900">
                                {permissionLabel(permission)}
                              </span>
                              {permissionDescription(permission) && (
                                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                  {permissionDescription(permission)}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs font-medium text-amber-800">
              {dirty ? "有尚未儲存的變更。取消會捨棄這些調整。" : "目前沒有未儲存變更。"}
            </p>
          </div>

          <div className="flex gap-2 border-t border-slate-200 pt-4">
            <button className={buttonClass} disabled={busy} type="submit">
              {busy ? "儲存中…" : "儲存"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onCancel}
              disabled={busy}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
