import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { buttonClass, Panel, FormField, inputClass } from "../../../components/ui";

const roleSchema = z.object({
  name: z.string().min(1, "角色名稱為必填").max(80, "角色名稱最多80字元"),
  description: z.string().max(255, "角色說明最多255字元").optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface RoleFormProps {
  showCreate: boolean;
  busy: boolean;
  onCreate: (data: RoleFormData) => void;
}

export function RoleForm({ showCreate, busy, onCreate }: RoleFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (!showCreate) {
      reset({ name: "", description: "" });
    }
  }, [showCreate, reset]);

  if (!showCreate) return null;

  return (
    <Panel title="新增角色" className="mb-5">
      <form
        onSubmit={handleSubmit((data) => {
          onCreate(data);
        })}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField label="角色名稱">
          <input {...register("name")} className={inputClass} disabled={busy} />
          {errors.name && <span className="text-sm text-red-500">{errors.name.message}</span>}
        </FormField>
        <FormField label="角色說明">
          <input {...register("description")} className={inputClass} disabled={busy} />
          {errors.description && (
            <span className="text-sm text-red-500">{errors.description.message}</span>
          )}
        </FormField>
        <div className="sm:col-span-2">
          <button className={buttonClass} disabled={busy} type="submit">
            {busy ? "建立中…" : "建立角色"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
