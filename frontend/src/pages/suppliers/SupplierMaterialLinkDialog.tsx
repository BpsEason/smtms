import React from "react";
import { X } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  FormField,
  inputClass,
  buttonClass,
  secondaryButtonClass,
} from "../../components/ui";
import * as Dialog from "@radix-ui/react-dialog";
import type { Material, Supplier } from "../../types";

const linkMaterialSchema = z.object({
  material_id: z.coerce.number().int().min(1, "請選擇物料"),
  supplier_material_code: z.string().max(80, "供應商料號最多80字元").optional(),
  is_preferred: z.boolean().default(false),
});

type LinkMaterialFormData = z.infer<typeof linkMaterialSchema>;

export type { LinkMaterialFormData };

const emptyLinkMaterialForm: LinkMaterialFormData = {
  material_id: 0,
  supplier_material_code: "",
  is_preferred: false,
};

interface SupplierMaterialLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkingSupplier: Supplier | null;
  materialOptions: Material[];
  isSubmitting: boolean;
  submitError?: string;
  onSubmit: (data: LinkMaterialFormData) => Promise<void>;
}

export function SupplierMaterialLinkDialog({
  open,
  onOpenChange,
  linkingSupplier,
  materialOptions,
  isSubmitting,
  submitError,
  onSubmit,
}: SupplierMaterialLinkDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LinkMaterialFormData>({
    resolver: zodResolver(linkMaterialSchema) as any,
    defaultValues: emptyLinkMaterialForm,
  });

  React.useEffect(() => {
    if (open) {
      reset(emptyLinkMaterialForm);
    }
  }, [open, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset(emptyLinkMaterialForm);
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
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[720px] translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-white p-6 shadow-lg animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              {linkingSupplier ? `建立供應物料關聯：${linkingSupplier.supplier_name}` : "建立供應物料關聯"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">關閉</span>
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-slate-500 mb-6">
            收料與供應商批號登錄只允許使用已建立關聯的供應商與物料。
          </Dialog.Description>
          {submitError && (
            <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {submitError}
            </p>
          )}

          <form
            key={linkingSupplier?.id ?? "new-link"}
            onSubmit={submitHandler}
            noValidate
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormField label="物料">
              <select {...register("material_id")} className={inputClass} required defaultValue="">
                <option value="">選擇物料</option>
                {materialOptions.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.material_code} · {material.material_name}
                  </option>
                ))}
              </select>
              {errors.material_id && <span className="text-sm text-rose-600">{errors.material_id.message}</span>}
            </FormField>
            <FormField label="供應商料號" hint="選填；填寫供應商使用的料件編碼。">
              <input {...register("supplier_material_code")} className={inputClass} maxLength={80} />
              {errors.supplier_material_code && <span className="text-sm text-rose-600">{errors.supplier_material_code.message}</span>}
            </FormField>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...register("is_preferred")} />
              設為此物料的首選供應商
            </label>
            <div className="sm:col-span-2 flex gap-2 mt-2">
              <button type="submit" className={buttonClass} disabled={isSubmitting || !materialOptions.length}>
                {isSubmitting ? "建立中…" : "建立關聯"}
              </button>
              <Dialog.Close asChild>
                <button type="button" className={secondaryButtonClass} disabled={isSubmitting}>
                  取消
                </button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}