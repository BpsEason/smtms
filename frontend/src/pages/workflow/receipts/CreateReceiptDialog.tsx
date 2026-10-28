import { X } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { localDateTimeNow } from "../../../lib/data";
import { Button } from "@/components/shadcn/button";
import {
  ConfirmDialog,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
} from "../../../components/ui";
import * as Dialog from "@radix-ui/react-dialog";
import type { Supplier, Material, SupplierLot } from "../types";

// Zod 驗證 schema - 新增收料表單
const receiptSchema = z.object({
  supplierId: z.string().min(1, "請選擇供應商"),
  materialId: z.string().min(1, "請選擇物料"),
  supplierLotId: z.string().min(1, "請選擇供應商批號"),
  receiptNo: z
    .string()
    .min(1, "收料單號為必填")
    .max(100, "收料單號最多100字元"),
  quantity: z.string().refine((val) => {
    const num = Number(val);
    return !isNaN(num) && num > 0 && num >= 0.0001;
  }, "收料數量必須大於0，最小單位為0.0001"),
  receivedAt: z.string().min(1, "收料日期為必填"),
  notes: z.string().max(500, "備註最多500字元").optional(),
});

type ReceiptFormData = z.infer<typeof receiptSchema>;

interface CreateReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  materials: Material[];
  canCreateSupplierLots: boolean;
  eligibleLots: SupplierLot[];
  resourceLoading: boolean;
  resourceError: string;
  isSubmitting: boolean;
  lotSaving: boolean;
  showLotForm: boolean;
  onShowLotFormChange: (show: boolean) => void;
  onSupplierIdChange: (id: string) => void;
  onMaterialIdChange: (id: string) => void;
  onSupplierLotIdChange: (id: string) => void;
  onCreateSupplierLot: () => void;
  onSubmit: (data: ReceiptFormData) => Promise<void>;
  onReset: () => void;
}

export function CreateReceiptDialog({
  open,
  onOpenChange,
  suppliers,
  materials,
  canCreateSupplierLots,
  eligibleLots,
  resourceLoading,
  resourceError,
  isSubmitting,
  lotSaving,
  showLotForm,
  onShowLotFormChange,
  onSupplierIdChange,
  onMaterialIdChange,
  onSupplierLotIdChange,
  onCreateSupplierLot,
  onSubmit,
  onReset,
}: CreateReceiptDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      supplierId: "",
      materialId: "",
      supplierLotId: "",
      receiptNo: "",
      quantity: "",
      receivedAt: localDateTimeNow(),
      notes: "",
    },
  });

  // 監聽表單值變化
  const watchSupplierId = watch("supplierId");
  const watchMaterialId = watch("materialId");

  // 直接在register中定義onChange，避免手動調用導致的循環
  // 移除自定義的handleSupplierChange和handleMaterialChange，改用內聯處理

  const handleFormSubmit = async (data: ReceiptFormData) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          reset();
          onReset();
          onShowLotFormChange(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(900px,calc(100vw-32px))] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-950">
                收料作業
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-slate-600">
                依序確認供應商、物料、供應商批號，再登錄收料數量。若供應商批號尚未建檔，可先在此登錄。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="關閉"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {resourceLoading ? (
            <LoadingState label="正在載入供應商與物料選項…" />
          ) : (
            <div className="mt-4 space-y-4">
              {resourceError && <ErrorState message={resourceError} />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  步驟一：登錄供應商批號
                </h3>
                {canCreateSupplierLots && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!suppliers.length || !materials.length}
                    onClick={() => onShowLotFormChange(!showLotForm)}
                  >
                    {showLotForm ? "關閉批號登錄" : "新增供應商批號"}
                  </Button>
                )}
              </div>
              {showLotForm && canCreateSupplierLots && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <form
                    onSubmit={(event) => event.preventDefault()}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <FormField label="供應商">
                      <select
                        className={inputClass}
                        name="supplier_id"
                        required
                        defaultValue={watchSupplierId}
                      >
                        <option value="">選擇供應商</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.supplier_code} · {supplier.supplier_name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="物料">
                      <select
                        className={inputClass}
                        name="material_id"
                        required
                        defaultValue={watchMaterialId}
                      >
                        <option value="">選擇物料</option>
                        {materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.material_code} · {material.material_name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="供應商批號（新建）">
                      <input
                        className={inputClass}
                        name="supplier_lot_no"
                        required
                        maxLength={120}
                      />
                    </FormField>
                    <FormField
                      label="批號申報數量"
                      hint="申報批號總量；收料單登錄本次實際到貨數量。"
                    >
                      <input
                        className={inputClass}
                        type="number"
                        name="qty_received"
                        min="0.0001"
                        step="0.0001"
                        required
                      />
                    </FormField>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="製造日期">
                        <input
                          className={inputClass}
                          type="date"
                          name="manufacturing_date"
                        />
                      </FormField>
                      <FormField label="有效期限">
                        <input
                          className={inputClass}
                          type="date"
                          name="expiry_date"
                        />
                      </FormField>
                    </div>
                    <p className="text-xs text-slate-600 sm:col-span-2">
                      僅能為已建立供應商－物料關聯的組合建立批號。若關聯不存在，請先到「供應商」頁面選擇「連結物料」。
                    </p>
                    <div className="flex gap-2 sm:col-span-2">
                      <ConfirmDialog
                        trigger={
                          <Button
                            type="button"
                            disabled={lotSaving}
                            onClick={(event) => {
                              const form = event.currentTarget
                                .form as HTMLFormElement;
                              if (!form?.reportValidity())
                                event.preventDefault();
                            }}
                          >
                            {lotSaving ? "建立中…" : "確認批號資料"}
                          </Button>
                        }
                        title="建立供應商批號？"
                        description="批號將與所選供應商及物料關聯，建立後可用於收料登錄。後端會檢查供應關係及批號唯一性。"
                        confirmLabel="建立批號"
                        onConfirm={onCreateSupplierLot}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={lotSaving}
                        onClick={() => onShowLotFormChange(false)}
                      >
                        取消
                      </Button>
                    </div>
                  </form>
                </div>
              )}
              <h3 className="border-t border-slate-200 pt-4 text-sm font-semibold text-slate-900">
                步驟二：登錄收料
              </h3>
              <form
                onSubmit={handleSubmit(handleFormSubmit)}
                className="space-y-4"
                noValidate
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="供應商"
                    error={errors.supplierId?.message}
                  >
                    <select
                      className={inputClass}
                      {...register("supplierId", {
                        onChange: (e) => {
                          onSupplierIdChange(e.target.value);
                          setValue("supplierLotId", "");
                          onSupplierLotIdChange("");
                        },
                      })}
                    >
                      <option value="">請選擇供應商</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.supplier_code} · {supplier.supplier_name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label="物料"
                    error={errors.materialId?.message}
                  >
                    <select
                      className={inputClass}
                      {...register("materialId", {
                        onChange: (e) => {
                          onMaterialIdChange(e.target.value);
                          setValue("supplierLotId", "");
                          onSupplierLotIdChange("");
                        },
                      })}
                    >
                      <option value="">請選擇物料</option>
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.material_code} · {material.material_name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <FormField
                  label="供應商批號"
                  hint="僅列出符合所選供應商與物料的批號。"
                  error={errors.supplierLotId?.message}
                >
                  <select
                    className={inputClass}
                    disabled={!watchSupplierId || !watchMaterialId}
                    {...register("supplierLotId")}
                  >
                    <option value="">請選擇供應商批號</option>
                    {eligibleLots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.supplier_lot_no} · {lot.qty_received} {lot.uom} · {lot.qc_status}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="收料單號"
                    error={errors.receiptNo?.message}
                  >
                    <input
                      className={inputClass}
                      maxLength={100}
                      {...register("receiptNo")}
                    />
                  </FormField>
                  <FormField
                    label="收料數量"
                    error={errors.quantity?.message}
                  >
                    <input
                      className={inputClass}
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      {...register("quantity")}
                    />
                  </FormField>
                  <FormField
                    label="收料日期"
                    error={errors.receivedAt?.message}
                  >
                    <input
                      className={inputClass}
                      type="datetime-local"
                      {...register("receivedAt")}
                    />
                  </FormField>
                  <FormField
                    label="備註"
                    error={errors.notes?.message}
                  >
                    <input
                      className={inputClass}
                      maxLength={500}
                      {...register("notes")}
                    />
                  </FormField>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "建立中…" : "建立收料單"}
                  </Button>
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary">
                      取消
                    </Button>
                  </Dialog.Close>
                </div>
              </form>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}