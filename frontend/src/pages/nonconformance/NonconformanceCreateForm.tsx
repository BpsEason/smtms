import { X } from "lucide-react";
import {
  FormField,
  inputClass,
} from "../../components/ui";
import { Button } from "@/components/shadcn/button";
import * as Dialog from '@radix-ui/react-dialog';
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { NonconformanceCreateFormData } from "./NonconformancePage";
import { SOURCE_OPTIONS, SEVERITY_OPTIONS } from "./constants";
import type { FormEventHandler } from "react";

type NonconformanceCreateFormProps = {
  isOpen: boolean;
  isLoading: boolean;
  register: UseFormRegister<NonconformanceCreateFormData>;
  errors: FieldErrors<NonconformanceCreateFormData>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
};

export function NonconformanceCreateForm({
  isOpen,
  isLoading,
  register,
  errors,
  onSubmit,
  onClose,
}: NonconformanceCreateFormProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[800px] translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-white p-6 shadow-lg animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              建立品質異常案件
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">關閉</span>
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-slate-500 mb-6">
            填寫品質異常案件的基本資訊，所有必填欄位都需完成才能提交。
          </Dialog.Description>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit} noValidate>
        <FormField label="異常編號" error={errors.case_no?.message}>
          <input
            className={inputClass}
            maxLength={80}
            {...register("case_no")}
          />
        </FormField>

        <FormField label="標題" error={errors.title?.message}>
          <input
            className={inputClass}
            maxLength={200}
            {...register("title")}
          />
        </FormField>

        <FormField label="來源" error={errors.source?.message}>
          <select
            className={inputClass}
            {...register("source")}
          >
            {SOURCE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="嚴重程度" error={errors.severity?.message}>
          <select
            className={inputClass}
            {...register("severity")}
          >
            {SEVERITY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="發現時間" error={errors.found_at?.message}>
          <input
            type="datetime-local"
            className={inputClass}
            {...register("found_at")}
          />
        </FormField>

        <FormField label="不良數量" error={errors.defect_qty?.message}>
          <input
            type="number"
            min="0"
            step="0.0001"
            className={inputClass}
            {...register("defect_qty")}
          />
        </FormField>

        <FormField label="供應商 ID（可選）" error={errors.supplier_id?.message}>
          <input
            type="number"
            min="1"
            className={inputClass}
            {...register("supplier_id")}
          />
        </FormField>

        <FormField label="物料 ID（可選）" error={errors.material_id?.message}>
          <input
            type="number"
            min="1"
            className={inputClass}
            {...register("material_id")}
          />
        </FormField>

        <FormField label="收料紀錄 ID（可選）" error={errors.receipt_id?.message}>
          <input
            type="number"
            min="1"
            className={inputClass}
            {...register("receipt_id")}
          />
        </FormField>

        <FormField label="供應商批號 ID（可選）" error={errors.supplier_lot_id?.message}>
          <input
            type="number"
            min="1"
            className={inputClass}
            {...register("supplier_lot_id")}
          />
        </FormField>

        <FormField label="內部批號 ID（可選）" error={errors.internal_lot_id?.message}>
          <input
            type="number"
            min="1"
            className={inputClass}
            {...register("internal_lot_id")}
          />
        </FormField>

        <FormField label="IQC 紀錄 ID（可選）" error={errors.iqc_record_id?.message}>
          <input
            type="number"
            min="1"
            className={inputClass}
            {...register("iqc_record_id")}
          />
        </FormField>

        <div className="md:col-span-2">
          <FormField label="異常描述" error={errors.description?.message}>
            <textarea
              rows={3}
              className={inputClass}
              {...register("description")}
            />
          </FormField>
        </div>

        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={isLoading} variant="default">
            建立案件
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
        </div>
      </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}