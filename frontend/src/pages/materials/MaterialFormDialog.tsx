import React from "react";
import { X } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/shadcn/button";
import {
  FormField,
  inputClass,
} from "../../components/ui";
import * as Dialog from "@radix-ui/react-dialog";
import type { Material } from "../../types";

const materialSchema = z.object({
  material_code: z.string().min(1, "物料代碼為必填").max(80, "物料代碼最多80字元"),
  material_name: z.string().min(1, "物料名稱為必填").max(200, "物料名稱最多200字元"),
  material_type: z.string().min(1, "物料類別為必填").max(50, "物料類別最多50字元"),
  uom: z.string().min(1, "計量單位為必填").max(30, "計量單位最多30字元"),
  spec: z.string().max(255, "規格最多255字元").optional(),
  status: z.string().min(1, "狀態為必填").max(20, "狀態最多20字元"),
});

type MaterialFormData = z.infer<typeof materialSchema>;

interface MaterialFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingMaterial: Material | null;
  isSubmitting: boolean;
  submitError?: string;
  onSubmit: (data: MaterialFormData) => Promise<void>;
}

export function MaterialFormDialog({
  open,
  onOpenChange,
  editingMaterial,
  isSubmitting,
  submitError,
  onSubmit,
}: MaterialFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaterialFormData>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      material_code: "",
      material_name: "",
      material_type: "",
      uom: "",
      spec: "",
      status: "active",
    },
  });

  // 當 editingMaterial 改變時重設表單
  React.useEffect(() => {
    if (editingMaterial) {
      reset({
        material_code: editingMaterial.material_code,
        material_name: editingMaterial.material_name,
        material_type: editingMaterial.material_type,
        uom: editingMaterial.uom,
        spec: editingMaterial.spec || "",
        status: editingMaterial.status,
      });
    } else {
      reset({
        material_code: "",
        material_name: "",
        material_type: "",
        uom: "",
        spec: "",
        status: "active",
      });
    }
  }, [editingMaterial, reset]);

  // 關閉對話框時重置表單
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset({
        material_code: "",
        material_name: "",
        material_type: "",
        uom: "",
        spec: "",
        status: "active",
      });
    }
    onOpenChange(newOpen);
  };

  const submitHandler = handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[600px] translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-white p-6 shadow-lg animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              {editingMaterial ? `編輯物料：${editingMaterial.material_name}` : "新增物料"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">關閉</span>
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-slate-500 mb-6">
            代碼需唯一；停用物料不會刪除既有庫存與追溯紀錄。
          </Dialog.Description>
          {submitError && (
            <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {submitError}
            </p>
          )}
          
          <form
            key={editingMaterial?.id ?? "new-material"}
            onSubmit={submitHandler}
            noValidate
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormField label="物料代碼" htmlFor="material_code">
              <input
                id="material_code"
                {...register("material_code")}
                className={inputClass}
                maxLength={80}
              />
              {errors.material_code && <span className="text-sm text-rose-600">{errors.material_code.message}</span>}
            </FormField>
            <FormField label="物料名稱" htmlFor="material_name">
              <input
                id="material_name"
                {...register("material_name")}
                className={inputClass}
                maxLength={200}
              />
              {errors.material_name && <span className="text-sm text-rose-600">{errors.material_name.message}</span>}
            </FormField>
            <FormField label="物料類別" htmlFor="material_type">
              <input
                id="material_type"
                {...register("material_type")}
                className={inputClass}
                maxLength={50}
              />
              {errors.material_type && <span className="text-sm text-rose-600">{errors.material_type.message}</span>}
            </FormField>
            <FormField label="計量單位" htmlFor="uom">
              <input
                id="uom"
                {...register("uom")}
                className={inputClass}
                maxLength={30}
              />
              {errors.uom && <span className="text-sm text-rose-600">{errors.uom.message}</span>}
            </FormField>
            <FormField label="規格" htmlFor="spec">
              <input
                id="spec"
                {...register("spec")}
                className={inputClass}
                maxLength={255}
              />
              {errors.spec && <span className="text-sm text-rose-600">{errors.spec.message}</span>}
            </FormField>
            <FormField label="物料狀態" htmlFor="status">
              <select id="status" {...register("status")} className={inputClass}>
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
              {errors.status && <span className="text-sm text-rose-600">{errors.status.message}</span>}
            </FormField>
            <p className="-mt-3 text-xs text-slate-500">停用不會刪除歷史作業資料。</p>
            <div className="sm:col-span-2 flex gap-2 mt-2">
              <Button variant="default" disabled={isSubmitting}>
                {isSubmitting ? "儲存中…" : editingMaterial ? "儲存變更" : "建立物料"}
              </Button>
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={isSubmitting}>
                  取消
                </Button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
