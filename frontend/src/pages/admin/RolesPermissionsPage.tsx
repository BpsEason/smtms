import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../api";
import {
  buttonClass,
  PageHeader,
  EmptyState,
  SuccessMessage,
  ErrorState,
} from "../../components/ui";
import { RoleForm } from "./components/RoleForm";
import { RoleEditModal, type RoleEditSavePayload } from "./components/RoleEditModal";
import { RolesList } from "./components/RolesList";
import { UsersManager } from "./components/UsersManager";
import {
  optional,
  message,
  type Role,
  type AdminUser,
  type UserProfile,
} from "./types";

export function RolesPermissionsPage({
  profile,
}: {
  profile: UserProfile | null;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserRoleIds, setNewUserRoleIds] = useState<number[]>([]);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editUserRoleIds, setEditUserRoleIds] = useState<number[]>([]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [userQuery, setUserQuery] = useState("");

  const canManage = Boolean(profile?.permissions.includes("users:manage"));

  const { data: roles = [], isLoading: rolesLoading, isError: rolesError, error: rolesErr } = useQuery({
    queryKey: ["roles"],
    queryFn: api.listRoles,
    staleTime: 5 * 60 * 1000,
  });

  const { data: permissions = [], isLoading: permissionsLoading, isError: permissionsError, error: permissionsErr } = useQuery({
    queryKey: ["permissions"],
    queryFn: api.listPermissions,
    staleTime: 10 * 60 * 1000,
  });

  const { data: users = [], isLoading: usersLoading, isError: usersError, error: usersErr } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
    staleTime: 2 * 60 * 1000,
  });

  const loading = rolesLoading || permissionsLoading || usersLoading;

  const createRoleMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => api.createRole(payload),
    onSuccess: () => {
      setSuccess("角色已建立。");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => setError(message(err)),
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: { username: string; email?: string; password: string; role_ids: number[] }) =>
      api.createUser(payload),
    onSuccess: () => {
      setSuccess("內部使用者已建立並完成角色指派。");
      setShowCreateUser(false);
      setNewUserRoleIds([]);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(message(err)),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({
      userId,
      payload,
    }: {
      userId: number;
      payload: { username?: string; email?: string | null; password?: string; role_ids?: number[] };
    }) => api.updateUser(userId, payload),
    onSuccess: (user) => {
      setSuccess(`內部使用者「${user.username}」已更新。`);
      setEditingUser(null);
      setEditUserRoleIds([]);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(message(err)),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { name: string; description?: string | null } }) =>
      api.updateRole(id, payload),
  });

  const setPermissionsMutation = useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) =>
      api.setRolePermissions(roleId, permissionIds),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => api.deleteRole(roleId),
    onSuccess: (_: unknown, roleId: number) => {
      const role = roles.find((r) => r.id === roleId);
      setSuccess(`角色「${role?.name || "未知角色"}」已刪除。`);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err: unknown) => setError(message(err)),
  });

  if (rolesError && rolesErr) {
    if (!error) setError(message(rolesErr));
  } else if (permissionsError && permissionsErr) {
    if (!error) setError(message(permissionsErr));
  } else if (usersError && usersErr) {
    if (!error) setError(message(usersErr));
  }

  const resetNotices = () => {
    setError("");
    setSuccess("");
  };

  if (!canManage) {
    return (
      <section>
        <PageHeader eyebrow="系統管理" title="角色與權限" description="管理系統角色、可指派權限與內部使用者角色。" />
        <EmptyState
          title="無法存取此功能"
          description="所需權限：users:manage。請洽系統管理員確認角色設定。"
        />
      </section>
    );
  }

  const createRole = async (data: { name: string; description?: string }) => {
    resetNotices();
    try {
      await createRoleMutation.mutateAsync({ name: data.name.trim(), description: optional(data.description) });
    } catch {
      // handled by mutation
    }
  };

  const createUser = async (data: { username: string; email?: string; password: string }) => {
    resetNotices();
    try {
      await createUserMutation.mutateAsync({
        username: data.username.trim(),
        email: optional(data.email),
        password: data.password,
        role_ids: newUserRoleIds,
      });
    } catch {
      // handled by mutation
    }
  };

  const updateUser = async (
    userId: number,
    data: { username: string; email?: string; password: string },
  ) => {
    resetNotices();
    const email = optional(data.email);
    try {
      await updateUserMutation.mutateAsync({
        userId,
        payload: {
          username: data.username.trim(),
          email: email ?? null,
          ...(data.password ? { password: data.password } : {}),
          role_ids: editUserRoleIds,
        },
      });
    } catch {
      // handled by mutation
    }
  };

  const saveRole = async (payload: RoleEditSavePayload) => {
    if (!editingRole) return;
    resetNotices();
    let roleUpdated = false;
    let permissionsUpdated = false;
    try {
      if (payload.nameChanged) {
        await updateRoleMutation.mutateAsync({
          id: editingRole.id,
          payload: { name: payload.name, description: payload.description },
        });
        roleUpdated = true;
      }
      if (payload.permissionsChanged) {
        await setPermissionsMutation.mutateAsync({
          roleId: editingRole.id,
          permissionIds: payload.permissionIds,
        });
        permissionsUpdated = true;
      }
      if (!roleUpdated && !permissionsUpdated) {
        setEditingRole(null);
        return;
      }
      setSuccess(`角色「${payload.name}」已更新。`);
      setEditingRole(null);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      if (roleUpdated && payload.permissionsChanged && !permissionsUpdated) {
        setError(`角色基本資料已更新，但權限儲存失敗：${message(err)}`);
      } else {
        setError(message(err));
      }
    }
  };

  const deleteRole = async (role: Role) => {
    resetNotices();
    try {
      await deleteRoleMutation.mutateAsync(role.id);
    } catch {
      // handled by mutation
    }
  };

  const openEditUser = (user: AdminUser) => {
    resetNotices();
    setShowCreateUser(false);
    setNewUserRoleIds([]);
    setEditingUser(user);
    setEditUserRoleIds(roles.filter((role) => user.roles.includes(role.name)).map((role) => role.id));
  };

  const visibleUsers = users.filter((user) =>
    `${user.username} ${user.email ?? ""} ${user.roles.join(" ")}`
      .toLocaleLowerCase()
      .includes(userQuery.trim().toLocaleLowerCase()),
  );

  const handleNewUserRoleChange = (roleId: number, checked: boolean) => {
    setNewUserRoleIds((current) => (checked ? [...current, roleId] : current.filter((id) => id !== roleId)));
  };

  const handleEditUserRoleChange = (roleId: number, checked: boolean) => {
    setEditUserRoleIds((current) => (checked ? [...current, roleId] : current.filter((id) => id !== roleId)));
  };

  const handleEditRole = (role: Role) => {
    resetNotices();
    setEditingRole(role);
  };

  const handleToggleCreate = () => {
    resetNotices();
    setShowCreate((value) => !value);
  };
  const handleToggleCreateUser = () => {
    resetNotices();
    setEditingUser(null);
    setEditUserRoleIds([]);
    setShowCreateUser((value) => !value);
  };
  const handleCancelCreateUser = () => {
    setShowCreateUser(false);
    setNewUserRoleIds([]);
  };
  const handleCancelEditUser = () => {
    setEditingUser(null);
    setEditUserRoleIds([]);
  };

  const isBusy =
    createRoleMutation.isPending ||
    updateRoleMutation.isPending ||
    setPermissionsMutation.isPending ||
    deleteRoleMutation.isPending ||
    createUserMutation.isPending ||
    updateUserMutation.isPending;

  return (
    <section>
      <PageHeader
        eyebrow="系統管理"
        title="角色與權限"
        description="管理系統角色、可指派權限與內部使用者角色。所有變更皆由後端權限驗證。"
        action={
          <button className={buttonClass} onClick={handleToggleCreate}>
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
          <ErrorState
            message={error}
            onRetry={() => {
              queryClient.invalidateQueries({ queryKey: ["roles"] });
              queryClient.invalidateQueries({ queryKey: ["permissions"] });
              queryClient.invalidateQueries({ queryKey: ["users"] });
            }}
          />
        </div>
      )}

      <RoleForm
        showCreate={showCreate}
        busy={isBusy}
        onCreate={createRole}
      />

      <RoleEditModal
        role={editingRole}
        permissions={permissions}
        busy={isBusy}
        onSave={saveRole}
        onCancel={() => setEditingRole(null)}
      />

      <RolesList
        roles={roles}
        permissions={permissions}
        loading={loading}
        onEditRole={handleEditRole}
        onDeleteRole={deleteRole}
      />

      <UsersManager
        users={users}
        roles={roles}
        loading={loading}
        showCreateUser={showCreateUser}
        userQuery={userQuery}
        visibleUsers={visibleUsers}
        newUserRoleIds={newUserRoleIds}
        editingUser={editingUser}
        editUserRoleIds={editUserRoleIds}
        busy={isBusy}
        error={error}
        onCreateUser={createUser}
        onUpdateUser={updateUser}
        onToggleCreateUser={handleToggleCreateUser}
        onUserQueryChange={setUserQuery}
        onNewUserRoleChange={handleNewUserRoleChange}
        onEditUserRoleChange={handleEditUserRoleChange}
        onCancelCreateUser={handleCancelCreateUser}
        onCancelEditUser={handleCancelEditUser}
        onOpenEditUser={openEditUser}
      />
    </section>
  );
}
