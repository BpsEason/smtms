import { Pencil, ShieldCheck, Trash2 } from "lucide-react";
import {
  secondaryButtonClass,
  Panel,
  LoadingState,
  EmptyState,
  DataTable,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
  ConfirmDialog,
} from "../../../components/ui";
import { permissionLabel } from "../types";
import type { Role, PermissionItem } from "../types";

interface RolesListProps {
  roles: Role[];
  permissions: PermissionItem[];
  loading: boolean;
  onOpenPermissions: (role: Role) => void;
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
}

export function RolesList({
  roles,
  permissions,
  loading,
  onOpenPermissions,
  onEditRole,
  onDeleteRole,
}: RolesListProps) {
  return (
    <Panel
      title="角色清單"
      description={`共 ${roles.length} 個角色 · 權限與使用者數由後端即時統計`}
      className="mb-5"
    >
      {loading ? (
        <LoadingState label="正在載入角色資料…" />
      ) : roles.length === 0 ? (
        <EmptyState title="尚無角色資料" />
      ) : (
        <DataTable>
          <TableHead>
            <TableRow>
              <Th>角色名稱</Th>
              <Th>說明</Th>
              <Th>權限</Th>
              <Th>使用者數</Th>
              <Th>操作</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <Td className="font-medium text-slate-950">
                  {role.name}
                  {role.is_system && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      系統角色
                    </span>
                  )}
                </Td>
                <Td>{role.description || "—"}</Td>
                <Td className="max-w-[280px]">
                  {role.permissions.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {role.permissions.map((code) => {
                        const permission = permissions.find(
                          (item) => item.code === code
                        );
                        return (
                          <span
                            key={code}
                            className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                          >
                            {permission ? permissionLabel(permission) : "權限資料尚未載入"}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{role.user_count}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={secondaryButtonClass}
                      aria-label={`設定權限 ${role.name}`}
                      onClick={() => onOpenPermissions(role)}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      設定權限
                    </button>
                    <button
                      className={secondaryButtonClass}
                      aria-label={`編輯 ${role.name}`}
                      onClick={() => onEditRole(role)}
                    >
                      <Pencil className="h-4 w-4" />
                      編輯
                    </button>
                    <ConfirmDialog
                      trigger={
                        <button
                          className={secondaryButtonClass}
                          aria-label={`刪除 ${role.name}`}
                          disabled={role.is_system || role.user_count > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                          刪除
                        </button>
                      }
                      title={`刪除角色 ${role.name}`}
                      description={`將永久刪除「${role.name}」角色及其權限設定。${
                        role.user_count
                          ? `目前有 ${role.user_count} 位成員，因此系統不允許刪除。`
                          : "此操作無法復原。"
                      }`}
                      confirmLabel="刪除角色"
                      destructive
                      onConfirm={() => onDeleteRole(role)}
                    />
                  </div>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </Panel>
  );
}