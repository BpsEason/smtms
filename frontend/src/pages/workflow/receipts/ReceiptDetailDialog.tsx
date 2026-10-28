import { X } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { statusLabel } from "../../../lib/status";
import { Button } from "@/components/shadcn/button";
import {
  ConfirmDialog,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  StatusBadge,
} from "../../../components/ui";
import * as Dialog from "@radix-ui/react-dialog";
import type { Receipt, ReceiptTrace } from "../types";

// Zod 驗證 schema - 拆分內部批號表單
const splitSchema = (maxQuantity: number) =>
  z.object({
    lotNo: z.string().min(1, "內部批號為必填").max(100, "內部批號最多100字元"),
    quantity: z.string().refine((val) => {
      const num = Number(val);
      return !isNaN(num) && num > 0 && num >= 0.0001 && num <= maxQuantity;
    }, `拆分數量必須大於0，最小單位為0.0001，且不得超過剩餘數量 ${maxQuantity}`),
  });

type SplitFormData = z.infer<ReturnType<typeof splitSchema>>;

interface ReceiptDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedReceipt: Receipt | null;
  trace: ReceiptTrace | null;
  canWrite: boolean;
  splitError: string;
  isSplitSubmitting: boolean;
  onSplitSubmit: (data: SplitFormData) => Promise<void>;
  onClose: () => void;
}

export function ReceiptDetailDialog({
  open,
  onOpenChange,
  selectedReceipt,
  trace,
  canWrite,
  splitError,
  isSplitSubmitting,
  onSplitSubmit,
  onClose,
}: ReceiptDetailDialogProps) {
  const maxRemainingQuantity = selectedReceipt
    ? Number(selectedReceipt.qty_remaining)
    : 0;

  const {
    register: registerSplit,
    handleSubmit: handleSubmitSplit,
    reset: resetSplit,
    formState: { errors: splitErrors, isSubmitting: isSplitSubmittingForm },
  } = useForm<SplitFormData>({
    resolver: zodResolver(splitSchema(maxRemainingQuantity)),
    defaultValues: {
      lotNo: "",
      quantity: "",
    },
  });

  // 當切換不同的收料單時，重新觸發驗證以更新最大數量限制
  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      resetSplit();
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(920px,calc(100vw-32px))] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl focus:outline-none">
          {selectedReceipt ? (
            <>
              {/* 標題區 */}
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-slate-900">
                    收料詳情
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedReceipt.receipt_no}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge value={selectedReceipt.status} />
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="關閉"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
              </div>

              <div className="space-y-6 px-6 py-5">
                {/* 基本資訊卡片 */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">收料單號</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {selectedReceipt.receipt_no}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">供應商 ID</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {selectedReceipt.supplier_id}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">物料 ID</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {selectedReceipt.material_id}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">收料日期</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {new Date(selectedReceipt.received_at).toLocaleString("zh-TW")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">收料數量</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {selectedReceipt.qty_received}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">剩餘數量</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {selectedReceipt.qty_remaining}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-500">備註</p>
                    <p className="mt-1 text-sm text-slate-900">
                      {selectedReceipt.notes || "—"}
                    </p>
                  </div>
                </div>

                {/* 拆分內部批號 */}
                {canWrite && Number(selectedReceipt.qty_remaining) > 0 && (
                  <div className="rounded-xl border border-slate-200">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h4 className="text-sm font-semibold text-slate-900">
                        拆分內部批號
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500">
                        剩餘可拆分數量：{selectedReceipt.qty_remaining}
                      </p>
                    </div>
                    <div className="p-4">
                      {splitError && (
                        <div className="mb-3">
                          <ErrorState message={splitError} />
                        </div>
                      )}
                      <form
                        onSubmit={handleSubmitSplit(onSplitSubmit)}
                        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
                        noValidate
                      >
                        <FormField
                          label="內部批號"
                          htmlFor="internal-lot-no"
                          error={splitErrors.lotNo?.message}
                        >
                          <input
                            id="internal-lot-no"
                            className={inputClass}
                            maxLength={100}
                            placeholder="輸入內部批號"
                            {...registerSplit("lotNo")}
                          />
                        </FormField>
                        <FormField
                          label="拆分數量"
                          htmlFor="split-quantity"
                          error={splitErrors.quantity?.message}
                        >
                          <input
                            id="split-quantity"
                            className={inputClass}
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            max={Number(selectedReceipt.qty_remaining)}
                            placeholder="0.0000"
                            {...registerSplit("quantity")}
                          />
                        </FormField>
                        <div className="flex items-end">
                          <ConfirmDialog
                            trigger={
                              <Button
                                type="button"
                                className="w-full"
                                disabled={isSplitSubmitting || isSplitSubmittingForm}
                              >
                                {isSplitSubmitting || isSplitSubmittingForm ? "拆分中…" : "拆分批號"}
                              </Button>
                            }
                            title="建立內部批號？"
                            description="將從此收料單拆分出一個新的內部批號，剩餘數量將自動更新。"
                            confirmLabel="確認拆分"
                            onConfirm={handleSubmitSplit(onSplitSubmit)}
                          />
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* 來源與品質追溯 */}
                {trace && (
                  <div className="rounded-xl border border-slate-200">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h4 className="text-sm font-semibold text-slate-900">
                        來源與品質追溯
                      </h4>
                    </div>
                    <div className="space-y-5 p-4">
                      {/* 供應商批號 */}
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                          供應商批號
                        </p>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
                          {trace.supplier_lot.supplier_lot_no}
                        </span>
                      </div>

                      {/* 已拆分內部批號 */}
                      {trace.internal_lots && trace.internal_lots.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                            已拆分內部批號
                          </p>
                          <div className="space-y-3">
                            {trace.internal_lots.map((lot) => (
                              <div
                                key={lot.internal_lot.id}
                                className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                                    {lot.internal_lot.internal_lot_no}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    數量 {lot.internal_lot.qty_on_hand}
                                  </span>
                                  <StatusBadge
                                    value={lot.internal_lot.lot_status}
                                    label={statusLabel(lot.internal_lot.lot_status)}
                                  />
                                </div>
                                {lot.iqc_records.length > 0 && (
                                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                    {lot.iqc_records.map((record) => (
                                      <p
                                        key={record.id}
                                        className="text-xs text-slate-600"
                                      >
                                        IQC-{record.id} ·{" "}
                                        {statusLabel(record.release_status)}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* IQC 檢驗記錄 */}
                      {trace.receipt_iqc_records &&
                        trace.receipt_iqc_records.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                              IQC 檢驗記錄
                            </p>
                            <div className="space-y-1.5">
                              {trace.receipt_iqc_records.map((record) => (
                                <div
                                  key={record.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <span className="text-slate-600">檢驗結果：</span>
                                  <StatusBadge value={record.inspection_result} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-16">
              <LoadingState label="正在載入收料詳情…" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}