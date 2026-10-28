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
import type { Supplier } from "../../types";

const supplierSchema = z.object({
  supplier_code: z.string().min(1, "供應商代碼為必填").max(80, "供應商代碼最多80字元"),
  supplier_name: z.string().min(1, "供應商名稱為必填").max(200, "供應商名稱最多200字元"),
  contact_name: z.string().max(120, "聯絡人最多120字元").optional(),
  email: z.string().max(160, "電子郵件最多160字元").refine((value) => !value || z.email().safeParse(value).success, "電子郵件格式不正確").optional(),
  phone: z.string().max(40, "電話最多40字元").optional(),
  country: z.string().max(80, "國家/地區最多80字元").optional(),
  address: z.string().max(255, "地址最多255字元").optional(),
  tax_id: z.string().max(20, "統一編號最多20字元").optional(),
  status: z.string().min(1, "狀態為必填").max(20, "狀態最多20字元"),
});

export type SupplierFormData = z.infer<typeof supplierSchema>;

const emptySupplierForm: SupplierFormData = {
  supplier_code: "",
  supplier_name: "",
  contact_name: "",
  email: "",
  phone: "",
  country: "",
  address: "",
  tax_id: "",
  status: "active",
};

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSupplier: Supplier | null;
  isSubmitting: boolean;
  submitError?: string;
  onSubmit: (data: SupplierFormData) => Promise<void>;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  editingSupplier,
  isSubmitting,
  submitError,
  onSubmit,
}: SupplierFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: emptySupplierForm,
  });

  React.useEffect(() => {
    if (editingSupplier) {
      reset({
        supplier_code: editingSupplier.supplier_code,
        supplier_name: editingSupplier.supplier_name,
        contact_name: editingSupplier.contact_name || "",
        email: editingSupplier.email || "",
        phone: editingSupplier.phone || "",
        country: editingSupplier.country || "",
        address: editingSupplier.address || "",
        tax_id: "",
        status: editingSupplier.status,
      });
    } else {
      reset(emptySupplierForm);
    }
  }, [editingSupplier, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset(emptySupplierForm);
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
              {editingSupplier ? `編輯供應商：${editingSupplier.supplier_name}` : "新增供應商"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">關閉</span>
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-slate-500 mb-6">
            代碼需唯一；停用供應商不會刪除既有追溯紀錄。
          </Dialog.Description>
          {submitError && (
            <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {submitError}
            </p>
          )}

          <form
            key={editingSupplier?.id ?? "new-supplier"}
            onSubmit={submitHandler}
            noValidate
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormField label="供應商代碼">
              <input
                {...register("supplier_code")}
                className={inputClass}
                maxLength={80}
              />
              {errors.supplier_code && <span className="text-sm text-rose-600">{errors.supplier_code.message}</span>}
            </FormField>
            <FormField label="供應商名稱">
              <input
                {...register("supplier_name")}
                className={inputClass}
                maxLength={200}
              />
              {errors.supplier_name && <span className="text-sm text-rose-600">{errors.supplier_name.message}</span>}
            </FormField>
            <FormField label="聯絡人">
              <input
                {...register("contact_name")}
                className={inputClass}
                maxLength={120}
              />
              {errors.contact_name && <span className="text-sm text-rose-600">{errors.contact_name.message}</span>}
            </FormField>
            <FormField label="電子郵件">
              <input
                {...register("email")}
                type="email"
                className={inputClass}
                maxLength={160}
              />
              {errors.email && <span className="text-sm text-rose-600">{errors.email.message}</span>}
            </FormField>
            <FormField label="電話">
              <input {...register("phone")} className={inputClass} maxLength={40} />
              {errors.phone && <span className="text-sm text-rose-600">{errors.phone.message}</span>}
            </FormField>
            <FormField label="國家／地區">
              <input {...register("country")} className={inputClass} maxLength={80} />
              {errors.country && <span className="text-sm text-rose-600">{errors.country.message}</span>}
            </FormField>
            <FormField label="地址">
              <input {...register("address")} className={inputClass} maxLength={255} />
              {errors.address && <span className="text-sm text-rose-600">{errors.address.message}</span>}
            </FormField>
            {!editingSupplier && (
              <FormField label="統一編號" hint="選填；建立後目前不可透過編輯流程更改。">
                <input {...register("tax_id")} className={inputClass} maxLength={20} />
                {errors.tax_id && <span className="text-sm text-rose-600">{errors.tax_id.message}</span>}
              </FormField>
            )}
            <FormField label="供應商狀態" hint="停用不會刪除供應商及歷史作業資料。">
              <select {...register("status")} className={inputClass}>
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
              {errors.status && <span className="text-sm text-rose-600">{errors.status.message}</span>}
            </FormField>
            <div className="sm:col-span-2 flex gap-2 mt-2">
              <Button variant="default" disabled={isSubmitting}>
                {isSubmitting ? "儲存中…" : editingSupplier ? "儲存變更" : "建立供應商"}
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
