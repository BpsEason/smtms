import { Search, Plus, Users } from "lucide-react";
import {
  buttonClass,
  secondaryButtonClass,
  Panel,
  FormField,
  inputClass,
  LoadingState,
  EmptyState,
  DataTable,
  TableHead,
  TableBody,
  TableRow,
  Th,
  Td,
  StatusBadge,
} from "../../../components/ui";
import type { Role, AdminUser } from "../types";

interface UsersManagerProps {
  users: AdminUser[];
  roles: Role[];
  loading: boolean;
  showCreateUser: boolean;
  userQuery: string;
  visibleUsers: AdminUser[];
  newUserRoleIds: number[];
  busy: boolean;
  onCreateUser: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleCreateUser: () => void;
  onUserQueryChange: (query: string) => void;
  onNewUserRoleChange: (roleId: number, checked: boolean) => void;
  onCancelCreateUser: () => void;
  onOpenUserRoles: (user: AdminUser) => void;
}

export function UsersManager({
  users,
  roles,
  loading,
  showCreateUser,
  userQuery,
  visibleUsers,
  newUserRoleIds,
  busy,
  onCreateUser,
  onToggleCreateUser,
  onUserQueryChange,
  onNewUserRoleChange,
  onCancelCreateUser,
  onOpenUserRoles,
}: UsersManagerProps) {
  return (
    <Panel
      title="內部使用者與角色指派"
      description={`共 ${users.length} 位內部使用者。搜尋帳號或電子郵件，再檢視目前角色並調整指派。`}
      action={
        <button
          className={buttonClass}
          onClick={onToggleCreateUser}
        >
          <Plus className="h-4 w-4" />
          {showCreateUser ? "關閉新增表單" : "新增內部使用者"}
        </button>
      }
    >
      {showCreateUser && (
        <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">新增內部使用者</h3>
          <p className="mb-4 text-xs text-slate-500">設定登入帳號與初始密碼，並選擇要指派的內部角色。</p>
          <form onSubmit={onCreateUser} className="grid gap-4 sm:grid-cols-2">
            <FormField label="登入帳號">
              <input
                name="username"
                className={inputClass}
                required
                minLength={1}
                maxLength={80}
                pattern="[A-Za-z0-9._-]+"
                autoComplete="off"
              />
            </FormField>
            <FormField label="電子郵件（選填）">
              <input
                name="email"
                type="email"
                className={inputClass}
                maxLength={255}
                autoComplete="email"
              />
            </FormField>
            <FormField label="初始密碼" hint="至少 8 個字元；建立後可使用此密碼登入。">
              <input
                name="password"
                type="password"
                aria-label="初始密碼"
                className={inputClass}
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
              />
            </FormField>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-slate-700">指派角色</legend>
              {roles.length === 0 ? (
                <p className="text-sm text-slate-500">目前沒有可指派的角色。</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        aria-label={`新使用者角色 ${role.name}`}
                        checked={newUserRoleIds.includes(role.id)}
                        disabled={role.is_system}
                        onChange={(event) =>
                          onNewUserRoleChange(role.id, event.target.checked)
                        }
                      />
                      <span>{role.name}{role.is_system ? "（系統角色不可指派）" : ""}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex gap-2 sm:col-span-2">
              <button className={buttonClass} disabled={busy}>
                {busy ? "建立中…" : "建立內部使用者"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={onCancelCreateUser}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          aria-label="搜尋內部使用者"
          className={`${inputClass} pl-9`}
          placeholder="搜尋帳號、電子郵件或角色"
          value={userQuery}
          onChange={(event) => onUserQueryChange(event.target.value)}
        />
      </div>
      {loading ? (
        <LoadingState label="正在載入使用者資料…" />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          title={users.length ? "找不到符合的使用者" : "尚無內部使用者"}
          description={users.length ? "請調整搜尋內容後再試。" : undefined}
        />
      ) : (
        <DataTable>
          <TableHead>
            <TableRow>
              <Th>帳號</Th>
              <Th>電子郵件</Th>
              <Th>狀態</Th>
              <Th>角色</Th>
              <Th>操作</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleUsers.map((user) => (
              <TableRow key={user.id}>
                <Td className="font-medium text-slate-950">
                  {user.username}
                </Td>
                <Td>{user.email || "—"}</Td>
                <Td>
                  <StatusBadge
                    value={user.is_active ? "active" : "inactive"}
                  />
                </Td>
                <Td>{user.roles.join("、") || "未指派角色"}</Td>
                <Td>
                  <button
                    className={secondaryButtonClass}
                    aria-label={`指派角色 ${user.username}`}
                    onClick={() => onOpenUserRoles(user)}
                  >
                    <Users className="h-4 w-4" />
                    指派角色
                  </button>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </Panel>
  );
}