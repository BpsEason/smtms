import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  buttonClass,
  secondaryButtonClass,
  Panel,
  FormField,
  inputClass,
} from "../../../components/ui";
import type { Role } from "../types";

// 角色表單驗證Schema，與原有HTML5驗證規則一致
const roleSchema = z.object({
  name: z.string().min(1, "角色名稱為必填").max(80, "角色名稱最多80字元"),
  description: z.string().max(255, "角色說明最多255字元").optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface RoleFormProps {
  editingRole: Role | null;
  showCreate: boolean;
  busy: boolean;
  onCreate: (data: RoleFormData) => void;
  onUpdate: (data: RoleFormData) => void;
  onCancelEdit: () => void;
}

export function RoleForm({
  editingRole,
  showCreate,
  busy,
  onCreate,
  onUpdate,
  onCancelEdit,
}: RoleFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // 當editingRole改變時重設表單
  useEffect(() => {
    if (editingRole) {
      reset({
        name: editingRole.name,
        description: editingRole.description ?? "",
      });
    } else {
      reset({
        name: "",
        description: "",
      });
    }
  }, [editingRole, reset]);

  const handleCreate = handleSubmit((data) => {
    onCreate(data);
  });

  const handleUpdate = handleSubmit((data) => {
    onUpdate(data);
  });

  return (
    <>
      {showCreate && (
        <Panel title="新增角色" className="mb-5">
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <FormField label="角色名稱">
              <input
                {...register("name")}
                className={inputClass}
                disabled={busy}
              />
              {errors.name && <span className="text-red-500 text-sm">{errors.name.message}</span>}
            </FormField>
            <FormField label="角色說明">
              <input
                {...register("description")}
                className={inputClass}
                disabled={busy}
              />
              {errors.description && <span className="text-red-500 text-sm">{errors.description.message}</span>}
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
          <form onSubmit={handleUpdate} className="grid gap-4 sm:grid-cols-2">
            <FormField label="角色名稱">
              <input
                {...register("name")}
                className={inputClass}
                disabled={editingRole.is_system || busy}
              />
              {errors.name && <span className="text-red-500 text-sm">{errors.name.message}</span>}
            </FormField>
            <FormField label="角色說明">
              <input
                {...register("description")}
                className={inputClass}
                disabled={busy}
              />
              {errors.description && <span className="text-red-500 text-sm">{errors.description.message}</span>}
            </FormField>
            <div className="flex gap-2 sm:col-span-2">
              <button className={buttonClass} disabled={busy}>
                {busy ? "儲存中…" : "儲存角色"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={onCancelEdit}
                disabled={busy}
              >
                取消
              </button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}