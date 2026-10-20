import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { api, ApiError } from "../api/client";
import {
  buttonClass,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  secondaryButtonClass,
  StatusBadge,
  SuccessMessage,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../components/ui";
import type { AdminUser, PermissionItem, Role, UserProfile } from "../types";

const PORTAL_PERMISSION = "suppliers:read";

export function RolesPermissionsPage({
  profile,
}: {
  profile: UserProfile | null;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserRoleIds, setNewUserRoleIds] = useState<number[]>([]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [permissionRole, setPermissionRole] = useState<Role | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>(
    [],
  );
  const [roleUserId, setRoleUserId] = useState<number | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [userQuery, setUserQuery] = useState("");

  const canManage = Boolean(profile?.permissions.includes("users:manage"));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roleList, permissionList, userList] = await Promise.all([
        api.listRoles(),
        api.listPermissions(),
        api.listUsers(),
      ]);
      setRoles(roleList);
      setPermissions(permissionList);
      setUsers(userList);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const resetNotices = () => {
    setError("");
    setSuccess("");
  };

  if (!canManage) {
    return (
      <section>
        <PageHeader
          eyebrow="系統管理"
          title="角色與權限"
          description="管理系統角色、可指派權限與內部使用者角色。"
        />
        <EmptyState
          title="無法存取此功能"
          description="所需權限：users:manage。請洽系統管理員確認角色設定。"
        />
      </section>
    );
  }

  const createRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetNotices();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api.createRole({
        name: String(form.get("name")).trim(),
        description: optional(form.get("description")),
      });
      setSuccess("角色已建立。");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetNotices();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api.createUser({
        username: String(form.get("username")).trim(),
        email: optional(form.get("email")),
        password: String(form.get("password")),
        role_ids: newUserRoleIds,
      });
      setSuccess("內部使用者已建立並完成角色指派。");
      setShowCreateUser(false);
      setNewUserRoleIds([]);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const updateRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRole) return;
    resetNotices();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api.updateRole(editingRole.id, {
        name: String(form.get("name")).trim(),
        description:
          form.get("description") === null
            ? null
            : optional(form.get("description")),
      });
      setSuccess("角色資料已更新。");
      setEditingRole(null);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteRole = async (role: Role) => {
    resetNotices();
    try {
      await api.deleteRole(role.id);
      setSuccess(`角色「${role.name}」已刪除。`);
      await load();
    } catch (err) {
      setError(message(err));
      throw err;
    }
  };

  const openPermissions = (role: Role) => {
    resetNotices();
    setEditingRole(null);
    setPermissionRole(role);
    setSelectedPermissionIds(
      permissions
        .filter((permission) => role.permissions.includes(permission.code))
        .map((permission) => permission.id),
    );
  };

  const savePermissions = async () => {
    if (!permissionRole) return;
    resetNotices();
    setBusy(true);
    try {
      await api.setRolePermissions(permissionRole.id, selectedPermissionIds);
      setSuccess(`角色「${permissionRole.name}」的權限已更新。`);
      setPermissionRole(null);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const openUserRoles = (user: AdminUser) => {
    resetNotices();
    setRoleUserId(user.id);
    setSelectedRoleIds(
      roles
        .filter((role) => user.roles.includes(role.name))
        .map((role) => role.id),
    );
  };

  const saveUserRoles = async () => {
    if (roleUserId === null) return;
    resetNotices();
    setBusy(true);
    try {
      await api.setUserRoles(roleUserId, selectedRoleIds);
      setSuccess("使用者角色已更新。");
      setRoleUserId(null);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const selectedUser = users.find((user) => user.id === roleUserId) ?? null;
  const visibleUsers = users.filter((user) =>
    `${user.username} ${user.email ?? ""} ${user.roles.join(" ")}`
      .toLocaleLowerCase()
      .includes(userQuery.trim().toLocaleLowerCase()),
  );
  const permissionIdsForRole = permissionRole
    ? permissions
        .filter((permission) => permissionRole.permissions.includes(permission.code))
        .map((permission) => permission.id)
    : [];
  const permissionsChanged =
    selectedPermissionIds.length !== permissionIdsForRole.length ||
    selectedPermissionIds.some((id) => !permissionIdsForRole.includes(id));
  const userRoleIdsForSelection = selectedUser
    ? roles.filter((role) => selectedUser.roles.includes(role.name)).map((role) => role.id)
    : [];
  const userRolesChanged =
    selectedRoleIds.length !== userRoleIdsForSelection.length ||
    selectedRoleIds.some((id) => !userRoleIdsForSelection.includes(id));
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

  return (
    <section>
      <PageHeader
        eyebrow="系統管理"
        title="角色與權限"
        description="管理系統角色、可指派權限與內部使用者角色。所有變更皆由後端權限驗證。"
        action={
          <button
            className={buttonClass}
            onClick={() => {
              resetNotices();
              setShowCreate((value) => !value);
            }}
          >
            <Plus className="h-4 w-4" />
            {showCreate ? "關閉" : "新增角色"}
          </button>
        }
      />
      {success && (
        <div className="mb-4">
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      )}

      {showCreate && (
        <Panel title="新增角色" className="mb-5">
          <form onSubmit={createRole} className="grid gap-4 sm:grid-cols-2">
            <FormField label="角色名稱">
              <input
                name="name"
                className={inputClass}
                required
                maxLength={80}
              />
            </FormField>
            <FormField label="角色說明">
              <input
                name="description"
                className={inputClass}
                maxLength={255}
              />
            </FormField>
            <div className="sm:col-span-2">
              <button className={buttonClass} disabled={busy}>
                {busy ? "建立中…" : "建立角色"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {editingRole && (
        <Panel title={`編輯角色：${editingRole.name}`} className="mb-5">
          <form onSubmit={updateRole} className="grid gap-4 sm:grid-cols-2">
            <FormField label="角色名稱">
              <input
                name="name"
                className={inputClass}
                required
                maxLength={80}
                defaultValue={editingRole.name}
                disabled={editingRole.is_system}
              />
            </FormField>
            <FormField label="角色說明">
              <input
                name="description"
                className={inputClass}
                maxLength={255}
                defaultValue={editingRole.description ?? ""}
              />
            </FormField>
            <div className="flex gap-2 sm:col-span-2">
              <button className={buttonClass} disabled={busy}>
                {busy ? "儲存中…" : "儲存角色"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setEditingRole(null)}
              >
                取消
              </button>
            </div>
          </form>
        </Panel>
      )}

      {permissionRole && (
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
              {Object.entries(permissionGroups).map(([group, items]) => <fieldset key={group} className="rounded-md border border-slate-200 p-4">
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
                        setSelectedPermissionIds((current) =>
                          event.target.checked
                            ? [...current, permission.id]
                            : current.filter((id) => id !== permission.id),
                        )
                      }
                    />
                    <span>
                      <span className="block font-medium text-slate-900">{permissionLabel(permission)}</span>
                      {permissionDescription(permission) && <span className="mt-0.5 block text-xs font-normal text-slate-500">{permissionDescription(permission)}</span>}
                    </span>
                  </label>
                );
              })}
                </div>
              </fieldset>)}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">勾選內容依系統目前提供的權限清單呈現；儲存時仍由伺服器檢查角色限制及管理員保護規則。</p>
          <p className="mt-3 text-xs font-medium text-amber-800">{permissionsChanged ? "有尚未儲存的權限變更。取消會捨棄這些調整。" : "目前沒有未儲存變更。"}</p>
          <div className="mt-4 flex gap-2">
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => void savePermissions()}
            >
              {busy ? "儲存中…" : "儲存權限"}
            </button>
            <button
              className={secondaryButtonClass}
              onClick={() => { setPermissionRole(null); setSelectedPermissionIds([]) }}
            >
              取消
            </button>
          </div>
        </Panel>
      )}

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
                      <span className="flex flex-wrap gap-1.5">{role.permissions.map((code) => {
                        const permission = permissions.find((item) => item.code === code);
                        return <span key={code} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{permission ? permissionLabel(permission) : "權限資料尚未載入"}</span>;
                      })}</span>
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
                        onClick={() => openPermissions(role)}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        設定權限
                      </button>
                      <button
                        className={secondaryButtonClass}
                        aria-label={`編輯 ${role.name}`}
                        onClick={() => {
                          resetNotices();
                          setPermissionRole(null);
                          setEditingRole(role);
                        }}
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
                        description={`將永久刪除「${role.name}」角色及其權限設定。${role.user_count ? `目前有 ${role.user_count} 位成員，因此系統不允許刪除。` : "此操作無法復原。"}`}
                        confirmLabel="刪除角色"
                        destructive
                        onConfirm={() => deleteRole(role)}
                      />
                    </div>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        )}
      </Panel>

      {selectedUser && (
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
                      setSelectedRoleIds((current) =>
                        event.target.checked
                          ? [...current, role.id]
                          : current.filter((id) => id !== role.id),
                      )
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
              onClick={() => void saveUserRoles()}
            >
              {busy ? "儲存中…" : "儲存角色指派"}
            </button>
            <button
              className={secondaryButtonClass}
              onClick={() => setRoleUserId(null)}
            >
              取消
            </button>
          </div>
          <p className="mt-3 text-xs font-medium text-amber-800">{userRolesChanged ? "有尚未儲存的成員角色變更。取消會捨棄這些調整。" : "目前沒有未儲存變更。"}</p>
        </Panel>
      )}

      <Panel
        title="內部使用者與角色指派"
        description={`共 ${users.length} 位內部使用者。搜尋帳號或電子郵件，再檢視目前角色並調整指派。`}
        action={
          <button
            className={buttonClass}
            onClick={() => {
              resetNotices();
              setShowCreateUser((value) => !value);
            }}
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
            <form onSubmit={createUser} className="grid gap-4 sm:grid-cols-2">
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
                            setNewUserRoleIds((current) =>
                              event.target.checked
                                ? [...current, role.id]
                                : current.filter((id) => id !== role.id),
                            )
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
                  onClick={() => {
                    setShowCreateUser(false);
                    setNewUserRoleIds([]);
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="relative mb-4 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="搜尋內部使用者" className={`${inputClass} pl-9`} placeholder="搜尋帳號、電子郵件或角色" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} /></div>
        {loading ? (
          <LoadingState label="正在載入使用者資料…" />
        ) : visibleUsers.length === 0 ? (
          <EmptyState title={users.length ? "找不到符合的使用者" : "尚無內部使用者"} description={users.length ? "請調整搜尋內容後再試。" : undefined} />
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
                      onClick={() => openUserRoles(user)}
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
    </section>
  );
}

function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function permissionLabel(permission: PermissionItem) {
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

function permissionDescription(permission: PermissionItem) {
  const description = permission.description?.trim();
  if (!description || /^Seed permission:/i.test(description)) return null;
  return description;
}

function message(error: unknown) {
  return error instanceof ApiError
    ? `操作失敗：${error.details}`
    : "請求失敗，請確認網路連線後再試一次。";
}
