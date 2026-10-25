import {
  buttonClass,
  secondaryButtonClass,
  Panel,
  EmptyState,
} from "../../../components/ui";
import { permissionLabel, permissionDescription, PORTAL_PERMISSION } from "../types";
import type { Role, PermissionItem } from "../types";

interface PermissionSettingsProps {
  permissionRole: Role | null;
  permissions: PermissionItem[];
  selectedPermissionIds: number[];
  busy: boolean;
  permissionsChanged: boolean;
  permissionGroups: Record<string, PermissionItem[]>;
  onPermissionChange: (permissionId: number, checked: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function PermissionSettings({
  permissionRole,
  permissions,
  selectedPermissionIds,
  busy,
  permissionsChanged,
  permissionGroups,
  onPermissionChange,
  onSave,
  onCancel,
}: PermissionSettingsProps) {
  if (!permissionRole) return null;

  return (
    <Panel
      title={`設定權限：${permissionRole.name}`}
      description={
        permissionRole.is_system
          ? "供應商入口角色為系統角色，僅能擁有供應商讀取權限。"
          : "勾選要指派給此角色的權限。"
      }
      className="mb-5"
    >
      {permissions.length === 0 ? (
        <EmptyState title="目前沒有可指派的權限" />
      ) : (
        <div className="space-y-5">
          {Object.entries(permissionGroups).map(([group, items]) => (
            <fieldset key={group} className="rounded-md border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-900">{group}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((permission) => {
                  const locked =
                    permissionRole.is_system &&
                    permission.code !== PORTAL_PERMISSION;
                  return (
                    <label
                      key={permission.id}
                      className="flex items-start gap-3 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        aria-label={permission.name}
                        checked={selectedPermissionIds.includes(permission.id)}
                        disabled={locked}
                        onChange={(event) =>
                          onPermissionChange(permission.id, event.target.checked)
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
      <p className="mt-4 text-xs text-slate-500">
        勾選內容依系統目前提供的權限清單呈現；儲存時仍由伺服器檢查角色限制及管理員保護規則。
      </p>
      <p className="mt-3 text-xs font-medium text-amber-800">
        {permissionsChanged
          ? "有尚未儲存的權限變更。取消會捨棄這些調整。"
          : "目前沒有未儲存變更。"}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          className={buttonClass}
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "儲存中…" : "儲存權限"}
        </button>
        <button
          className={secondaryButtonClass}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </Panel>
  );
}