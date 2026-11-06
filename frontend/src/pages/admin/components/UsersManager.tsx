import { useEffect } from "react";
import { Search, Plus, Pencil } from "lucide-react";
import { Modal } from "antd";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
  ErrorState,
} from "../../../components/ui";
import type { Role, AdminUser } from "../types";

const createUserSchema = z.object({
  username: z
    .string()
    .min(1, "登入帳號為必填")
    .max(80, "登入帳號最多 80 字元")
    .regex(/^[A-Za-z0-9._-]+$/, "登入帳號只能包含英數字、底線、點和減號"),
  email: z
    .string()
    .max(255, "電子郵件最多 255 字元")
    .email("電子郵件格式不正確")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "密碼至少需要 8 個字元")
    .max(72, "密碼最多 72 個字元"),
});

const editUserSchema = createUserSchema.extend({
  password: z.union([
    z.literal(""),
    z.string().min(8, "密碼至少需要 8 個字元").max(72, "密碼最多 72 個字元"),
  ]),
});

export type UserFormData = {
  username: string;
  email?: string;
  password: string;
};

interface UsersManagerProps {
  users: AdminUser[];
  roles: Role[];
  loading: boolean;
  showCreateUser: boolean;
  userQuery: string;
  visibleUsers: AdminUser[];
  newUserRoleIds: number[];
  editingUser: AdminUser | null;
  editUserRoleIds: number[];
  busy: boolean;
  error?: string;
  onCreateUser: (data: UserFormData) => void;
  onUpdateUser: (userId: number, data: UserFormData) => void;
  onToggleCreateUser: () => void;
  onUserQueryChange: (query: string) => void;
  onNewUserRoleChange: (roleId: number, checked: boolean) => void;
  onEditUserRoleChange: (roleId: number, checked: boolean) => void;
  onCancelCreateUser: () => void;
  onCancelEditUser: () => void;
  onOpenEditUser: (user: AdminUser) => void;
}

export function UsersManager({
  users,
  roles,
  loading,
  showCreateUser,
  userQuery,
  visibleUsers,
  newUserRoleIds,
  editingUser,
  editUserRoleIds,
  busy,
  error,
  onCreateUser,
  onUpdateUser,
  onToggleCreateUser,
  onUserQueryChange,
  onNewUserRoleChange,
  onEditUserRoleChange,
  onCancelCreateUser,
  onCancelEditUser,
  onOpenEditUser,
}: UsersManagerProps) {
  const isEdit = Boolean(editingUser);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(isEdit ? editUserSchema : createUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (editingUser) {
      reset({
        username: editingUser.username,
        email: editingUser.email ?? "",
        password: "",
      });
      return;
    }
    if (showCreateUser) {
      reset({ username: "", email: "", password: "" });
    }
  }, [editingUser, reset, showCreateUser]);

  const handleCancel = () => {
    reset({ username: "", email: "", password: "" });
    if (isEdit) {
      onCancelEditUser();
    } else {
      onCancelCreateUser();
    }
  };

  const modalOpen = showCreateUser || isEdit;
  const roleIds = isEdit ? editUserRoleIds : newUserRoleIds;
  const onRoleChange = isEdit ? onEditUserRoleChange : onNewUserRoleChange;

  return (
    <>
      <Modal
        open={modalOpen}
        title={isEdit ? "編輯內部使用者" : "新增內部使用者"}
        onCancel={handleCancel}
        footer={null}
        destroyOnHidden
        maskClosable={!busy}
        closable={!busy}
        width={720}
      >
        <p className="mb-4 text-xs text-slate-500">
          {isEdit
            ? "修改帳號、電子郵件、密碼與角色。密碼留空時不會變更原密碼。"
            : "設定登入帳號與初始密碼，並選擇要指派的內部角色。"}
        </p>
        {error && (
          <div className="mb-4">
            <ErrorState message={error} />
          </div>
        )}
        <form
          onSubmit={handleSubmit((data) => {
            if (isEdit && editingUser) {
              onUpdateUser(editingUser.id, data);
            } else {
              onCreateUser(data);
            }
          })}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField label="登入帳號">
            <input {...register("username")} className={inputClass} autoComplete="off" />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
            )}
          </FormField>
          <FormField label="電子郵件（選填）">
            <input {...register("email")} type="email" className={inputClass} autoComplete="email" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </FormField>
          <FormField
            label={isEdit ? "新密碼（選填）" : "初始密碼"}
            hint={isEdit ? "留空則不變更密碼；若填寫至少 8 個字元。" : "至少 8 個字元；建立後可使用此密碼登入。"}
          >
            <input
              {...register("password")}
              type="password"
              aria-label={isEdit ? "新密碼（選填）" : "初始密碼"}
              className={inputClass}
              autoComplete="new-password"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
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
                      aria-label={`${isEdit ? "編輯使用者角色" : "新使用者角色"} ${role.name}`}
                      checked={roleIds.includes(role.id)}
                      disabled={role.is_system}
                      onChange={(e) => onRoleChange(role.id, e.target.checked)}
                    />
                    <span>
                      {role.name}
                      {role.is_system ? "（系統角色不可指派）" : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex gap-2 sm:col-span-2">
            <button className={buttonClass} disabled={busy} type="submit">
              {busy ? (isEdit ? "儲存中…" : "建立中…") : isEdit ? "儲存變更" : "建立內部使用者"}
            </button>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={handleCancel}>
              取消
            </button>
          </div>
        </form>
      </Modal>

      <Panel
        title="內部使用者"
        description={`共 ${users.length} 位內部使用者。可在編輯中修改基本資料與角色。`}
        action={
          <button className={buttonClass} onClick={onToggleCreateUser} type="button">
            <Plus className="h-4 w-4" />
            {showCreateUser ? "關閉新增表單" : "新增內部使用者"}
          </button>
        }
      >
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
                  <Td className="font-medium text-slate-950">{user.username}</Td>
                  <Td>{user.email || "—"}</Td>
                  <Td>
                    <StatusBadge value={user.is_active ? "active" : "inactive"} />
                  </Td>
                  <Td>{user.roles.join("、") || "未指派角色"}</Td>
                  <Td>
                    <button
                      className={secondaryButtonClass}
                      aria-label={`編輯使用者 ${user.username}`}
                      onClick={() => onOpenEditUser(user)}
                      type="button"
                    >
                      <Pencil className="h-4 w-4" />
                      編輯
                    </button>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        )}
      </Panel>
    </>
  );
}
