import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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

  // 使用TanStack Query管理伺服器狀態
  const { data: roles = [], isLoading: rolesLoading, isError: rolesError, error: rolesErr } = useQuery({
    queryKey: ["roles"],
    queryFn: api.listRoles,
    staleTime: 5 * 60 * 1000, // 5分鐘內不重新獲取
  });

  const { data: permissions = [], isLoading: permissionsLoading, isError: permissionsError, error: permissionsErr } = useQuery({
    queryKey: ["permissions"],
    queryFn: api.listPermissions,
    staleTime: 10 * 60 * 1000, // 權限很少變動，10分鐘快取
  });

  const { data: users = [], isLoading: usersLoading, isError: usersError, error: usersErr } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
    staleTime: 2 * 60 * 1000, // 使用者資料2分鐘快取
  });

  const loading = rolesLoading || permissionsLoading || usersLoading;

  // 處理查詢錯誤
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

  // 角色建立Mutation
  const createRoleMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      return api.createRole(payload);
    },
    onSuccess: () => {
      setSuccess("角色已建立。");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => {
      setError(message(err));
    },
  });

  const createRole = async (data: { name: string; description?: string }) => {
    resetNotices();
    try {
      await createRoleMutation.mutateAsync({
        name: data.name.trim(),
        description: optional(data.description),
      });
    } catch {
      // 錯誤已由mutation的onError處理，這裡僅捕獲避免unhandled rejection
    }
  };

  // 使用者建立Mutation
  const createUserMutation = useMutation({
    mutationFn: async (payload: { username: string; email?: string; password: string; role_ids: number[] }) => {
      return api.createUser(payload);
    },
    onSuccess: () => {
      setSuccess("內部使用者已建立並完成角色指派。");
      setShowCreateUser(false);
      setNewUserRoleIds([]);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      setError(message(err));
    },
  });

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
      // 錯誤已由mutation的onError處理，這裡僅捕獲避免unhandled rejection
    }
  };

  // 角色更新Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { name: string; description?: string | null } }) => {
      return api.updateRole(id, payload);
    },
    onSuccess: () => {
      setSuccess("角色資料已更新。");
      setEditingRole(null);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => {
      setError(message(err));
    },
  });

  const updateRole = async (data: { name: string; description?: string | null }) => {
    if (!editingRole) return;
    resetNotices();
    try {
      await updateRoleMutation.mutateAsync({
        id: editingRole.id,
        payload: {
          name: data.name.trim(),
          description: data.description === null || data.description === undefined ? null : optional(data.description),
        },
      });
    } catch {
      // 錯誤已由mutation的onError處理，這裡僅捕獲避免unhandled rejection
    }
  };

  // 角色刪除Mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      return api.deleteRole(roleId);
    },
    onSuccess: (_: unknown, roleId: number) => {
      const role = roles.find(r => r.id === roleId);
      setSuccess(`角色「${role?.name || '未知角色'}」已刪除。`);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err: unknown) => {
      setError(message(err));
    },
  });

  const deleteRole = async (role: Role) => {
    resetNotices();
    try {
      await deleteRoleMutation.mutateAsync(role.id);
    } catch {
      // 錯誤已由mutation的onError處理，這裡僅捕獲避免unhandled rejection
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

  // 權限設定Mutation
  const savePermissionsMutation = useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) => {
      return api.setRolePermissions(roleId, permissionIds);
    },
    onSuccess: (_, variables) => {
      const role = roles.find(r => r.id === variables.roleId);
      setSuccess(`角色「${role?.name || permissionRole?.name}」的權限已更新。`);
      setPermissionRole(null);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => {
      setError(message(err));
    },
  });

  const savePermissions = async () => {
    if (!permissionRole) return;
    resetNotices();
    try {
      await savePermissionsMutation.mutateAsync({
        roleId: permissionRole.id,
        permissionIds: selectedPermissionIds,
      });
    } catch {
      // 錯誤已由mutation的onError處理，這裡僅捕獲避免unhandled rejection
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

  // 使用者角色更新Mutation
  const saveUserRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: number; roleIds: number[] }) => {
      return api.setUserRoles(userId, roleIds);
    },
    onSuccess: () => {
      setSuccess("使用者角色已更新。");
      setRoleUserId(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      setError(message(err));
    },
  });

  const saveUserRoles = async () => {
    if (roleUserId === null) return;
    resetNotices();
    try {
      await saveUserRolesMutation.mutateAsync({
        userId: roleUserId,
        roleIds: selectedRoleIds,
      });
    } catch {
      // 錯誤已由mutation的onError處理，這裡僅捕獲避免unhandled rejection
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

  // 合併所有mutation的pending狀態，作為子元件的busy屬性
  const isBusy = 
    createRoleMutation.isPending || 
    updateRoleMutation.isPending || 
    deleteRoleMutation.isPending || 
    savePermissionsMutation.isPending || 
    createUserMutation.isPending || 
    saveUserRolesMutation.isPending;

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
          <ErrorState message={error} onRetry={() => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            queryClient.invalidateQueries({ queryKey: ["permissions"] });
            queryClient.invalidateQueries({ queryKey: ["users"] });
          }} />
        </div>
      )}

      <RoleForm
        editingRole={editingRole}
        showCreate={showCreate}
        busy={isBusy}
        onCreate={createRole}
        onUpdate={updateRole}
        onCancelEdit={handleCancelEdit}
      />

      <PermissionSettings
        permissionRole={permissionRole}
        permissions={permissions}
        selectedPermissionIds={selectedPermissionIds}
        busy={isBusy}
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
        busy={isBusy}
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
        busy={isBusy}
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