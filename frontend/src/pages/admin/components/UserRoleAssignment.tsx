import {
  buttonClass,
  secondaryButtonClass,
  Panel,
  EmptyState,
} from "../../../components/ui";
import type { Role, AdminUser } from "../types";

interface UserRoleAssignmentProps {
  selectedUser: AdminUser | null;
  roles: Role[];
  selectedRoleIds: number[];
  busy: boolean;
  userRolesChanged: boolean;
  onRoleChange: (roleId: number, checked: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function UserRoleAssignment({
  selectedUser,
  roles,
  selectedRoleIds,
  busy,
  userRolesChanged,
  onRoleChange,
  onSave,
  onCancel,
}: UserRoleAssignmentProps) {
  if (!selectedUser) return null;

  return (
    <Panel
      title={`指派角色：${selectedUser.username}`}
      description="僅限內部使用者；供應商入口帳號不得指派內部角色。"
      className="mb-5"
    >
      {roles.length === 0 ? (
        <EmptyState title="目前沒有可指派的角色" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => (
            <label
              key={role.id}
              className="flex items-start gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                aria-label={`角色 ${role.name}`}
                checked={selectedRoleIds.includes(role.id)}
                disabled={role.is_system}
                onChange={(event) =>
                  onRoleChange(role.id, event.target.checked)
                }
              />
              <span>
                <span className="font-medium text-slate-900">
                  {role.name}
                </span>
                {role.is_system && (
                  <span className="ml-2 text-xs text-slate-500">
                    系統角色
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          className={buttonClass}
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "儲存中…" : "儲存角色指派"}
        </button>
        <button
          className={secondaryButtonClass}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
      <p className="mt-3 text-xs font-medium text-amber-800">
        {userRolesChanged
          ? "有尚未儲存的成員角色變更。取消會捨棄這些調整。"
          : "目前沒有未儲存變更。"}
      </p>
    </Panel>
  );
}