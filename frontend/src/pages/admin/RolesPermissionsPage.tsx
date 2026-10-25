import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "../../api/client";
import {
  buttonClass,
  PageHeader,
  EmptyState,
  SuccessMessage,
  ErrorState,
} from "../../components/ui";
import { RoleForm } from "./components/RoleForm";
import { PermissionSettings } from "./components/PermissionSettings";
import { RolesList } from "./components/RolesList";
import { UserRoleAssignment } from "./components/UserRoleAssignment";
import { UsersManager } from "./components/UsersManager";
import {
  optional,
  message,
  type Role,
  type PermissionItem,
  type AdminUser,
  type UserProfile,
} from "./types";

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

  const handlePermissionChange = (permissionId: number, checked: boolean) => {
    setSelectedPermissionIds((current) =>
      checked
        ? [...current, permissionId]
        : current.filter((id) => id !== permissionId)
    );
  };

  const handleRoleChange = (roleId: number, checked: boolean) => {
    setSelectedRoleIds((current) =>
      checked
        ? [...current, roleId]
        : current.filter((id) => id !== roleId)
    );
  };

  const handleNewUserRoleChange = (roleId: number, checked: boolean) => {
    setNewUserRoleIds((current) =>
      checked
        ? [...current, roleId]
        : current.filter((id) => id !== roleId)
    );
  };

  const handleEditRole = (role: Role) => {
    resetNotices();
    setPermissionRole(null);
    setEditingRole(role);
  };

  const handleCancelEdit = () => {
    setEditingRole(null);
  };

  const handleToggleCreate = () => {
    resetNotices();
    setShowCreate((value) => !value);
  };

  const handleToggleCreateUser = () => {
    resetNotices();
    setShowCreateUser((value) => !value);
  };

  const handleCancelPermissions = () => {
    setPermissionRole(null);
    setSelectedPermissionIds([]);
  };

  const handleCancelUserRoles = () => {
    setRoleUserId(null);
  };

  const handleCancelCreateUser = () => {
    setShowCreateUser(false);
    setNewUserRoleIds([]);
  };

  return (
    <section>
      <PageHeader
        eyebrow="系統管理"
        title="角色與權限"
        description="管理系統角色、可指派權限與內部使用者角色。所有變更皆由後端權限驗證。"
        action={
          <button
            className={buttonClass}
            onClick={handleToggleCreate}
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

      <RoleForm
        editingRole={editingRole}
        showCreate={showCreate}
        busy={busy}
        onCreate={createRole}
        onUpdate={updateRole}
        onCancelEdit={handleCancelEdit}
      />

      <PermissionSettings
        permissionRole={permissionRole}
        permissions={permissions}
        selectedPermissionIds={selectedPermissionIds}
        busy={busy}
        permissionsChanged={permissionsChanged}
        permissionGroups={permissionGroups}
        onPermissionChange={handlePermissionChange}
        onSave={savePermissions}
        onCancel={handleCancelPermissions}
      />

      <RolesList
        roles={roles}
        permissions={permissions}
        loading={loading}
        onOpenPermissions={openPermissions}
        onEditRole={handleEditRole}
        onDeleteRole={deleteRole}
      />

      <UserRoleAssignment
        selectedUser={selectedUser}
        roles={roles}
        selectedRoleIds={selectedRoleIds}
        busy={busy}
        userRolesChanged={userRolesChanged}
        onRoleChange={handleRoleChange}
        onSave={saveUserRoles}
        onCancel={handleCancelUserRoles}
      />

      <UsersManager
        users={users}
        roles={roles}
        loading={loading}
        showCreateUser={showCreateUser}
        userQuery={userQuery}
        visibleUsers={visibleUsers}
        newUserRoleIds={newUserRoleIds}
        busy={busy}
        onCreateUser={createUser}
        onToggleCreateUser={handleToggleCreateUser}
        onUserQueryChange={setUserQuery}
        onNewUserRoleChange={handleNewUserRoleChange}
        onCancelCreateUser={handleCancelCreateUser}
        onOpenUserRoles={openUserRoles}
      />
    </section>
  );
}