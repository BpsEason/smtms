import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Descriptions, Divider, Empty, Modal, Space, Typography } from "antd";
import { statusLabel } from "../../../lib/status";
import {
  ConfirmDialog,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  StatusBadge,
  buttonClass,
} from "../../../components/ui";
import type { Receipt, ReceiptTrace } from "../types";

const { Text, Title } = Typography;

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

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetSplit();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => handleOpenChange(false)}
      title={
        selectedReceipt ? (
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <div>
              <Title level={4} style={{ margin: 0 }}>
                收料詳情
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {selectedReceipt.receipt_no}
              </Text>
            </div>
            <StatusBadge value={selectedReceipt.status} />
          </div>
        ) : (
          "收料詳情"
        )
      }
      width={920}
      footer={null}
      destroyOnHidden
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
    >
      {!selectedReceipt ? (
        <LoadingState label="正在載入收料詳情…" />
      ) : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="收料單號">{selectedReceipt.receipt_no}</Descriptions.Item>
            <Descriptions.Item label="供應商 ID">{selectedReceipt.supplier_id}</Descriptions.Item>
            <Descriptions.Item label="物料 ID">{selectedReceipt.material_id}</Descriptions.Item>
            <Descriptions.Item label="收料日期">
              {new Date(selectedReceipt.received_at).toLocaleString("zh-TW")}
            </Descriptions.Item>
            <Descriptions.Item label="收料數量">{selectedReceipt.qty_received}</Descriptions.Item>
            <Descriptions.Item label="剩餘數量">{selectedReceipt.qty_remaining}</Descriptions.Item>
            <Descriptions.Item label="備註" span={2}>
              {selectedReceipt.notes || "—"}
            </Descriptions.Item>
          </Descriptions>

          {canWrite && Number(selectedReceipt.qty_remaining) > 0 && (
            <>
              <Divider titlePlacement="start" plain>
                拆分內部批號
              </Divider>
              <Text type="secondary" style={{ fontSize: 12 }}>
                剩餘可拆分數量：{selectedReceipt.qty_remaining}
              </Text>
              {splitError && (
                <div className="mb-2">
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
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={isSplitSubmitting || isSplitSubmittingForm}
                      >
                        {isSplitSubmitting || isSplitSubmittingForm ? "拆分中…" : "拆分批號"}
                      </button>
                    }
                    title="建立內部批號？"
                    description="將從此收料單拆分出一個新的內部批號，剩餘數量將自動更新。"
                    confirmLabel="確認拆分"
                    onConfirm={handleSubmitSplit(onSplitSubmit)}
                  />
                </div>
              </form>
            </>
          )}

          {trace && (
            <>
              <Divider titlePlacement="start" plain>
                來源與品質追溯
              </Divider>

              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  供應商批號
                </Text>
                <div className="mt-1">
                  <StatusBadge value="available" label={trace.supplier_lot.supplier_lot_no} />
                </div>
              </div>

              {trace.internal_lots && trace.internal_lots.length > 0 ? (
                <div className="space-y-3">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已拆分內部批號
                  </Text>
                  {trace.internal_lots.map((lot) => (
                    <div
                      key={lot.internal_lot.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                    >
                      <Space wrap size="small">
                        <Text strong>{lot.internal_lot.internal_lot_no}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          數量 {lot.internal_lot.qty_on_hand}
                        </Text>
                        <StatusBadge
                          value={lot.internal_lot.lot_status}
                          label={statusLabel(lot.internal_lot.lot_status)}
                        />
                      </Space>
                      {lot.iqc_records.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                          {lot.iqc_records.map((record) => (
                            <Text key={record.id} type="secondary" style={{ fontSize: 12, display: "block" }}>
                              IQC-{record.id} · {statusLabel(record.release_status)}
                            </Text>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未拆分內部批號" />
              )}

              {trace.receipt_iqc_records && trace.receipt_iqc_records.length > 0 && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    IQC 檢驗記錄
                  </Text>
                  <div className="mt-2 space-y-2">
                    {trace.receipt_iqc_records.map((record) => (
                      <Space key={record.id}>
                        <Text style={{ fontSize: 13 }}>檢驗結果：</Text>
                        <StatusBadge value={record.inspection_result} />
                      </Space>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Space>
      )}
    </Modal>
  );
}