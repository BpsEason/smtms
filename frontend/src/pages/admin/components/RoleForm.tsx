import type { FormEvent } from "react";
import {
  buttonClass,
  secondaryButtonClass,
  Panel,
  FormField,
  inputClass,
} from "../../../components/ui";
import type { Role } from "../types";

interface RoleFormProps {
  editingRole: Role | null;
  showCreate: boolean;
  busy: boolean;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (event: FormEvent<HTMLFormElement>) => void;
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
  return (
    <>
      {showCreate && (
        <Panel title="新增角色" className="mb-5">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
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
          <form onSubmit={onUpdate} className="grid gap-4 sm:grid-cols-2">
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
                onClick={onCancelEdit}
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