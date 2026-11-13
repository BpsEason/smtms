import {
  Button,
  Descriptions,
  Divider,
  Empty,
  Modal,
  Space,
  Timeline,
  Typography,
} from "antd";
import {
  FormField,
  SeverityBadge,
  StatusBadge,
  inputClass,
  buttonClass,
  secondaryButtonClass,
} from "../../components/ui";
import type { NonconformanceDetailProps } from "./types";
import { SEVERITY_OPTIONS } from "./constants";

const { Text, Title } = Typography;

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function NonconformanceDetail({
  selectedItem,
  isLoading,
  canEditSelected,
  canModify,
  registerEdit,
  editErrors,
  getEditValues,
  registerDisposition,
  dispositionErrors,
  onSaveInvestigation,
  onStatusTransition,
  onAddDisposition,
  onUploadAttachment,
  onDownloadAttachment,
  onRemoveAttachment,
  onClose,
}: NonconformanceDetailProps) {
  if (!selectedItem) return null;

  const formInvestigation = getEditValues("investigation") || "";
  const selectedItemInvestigation = selectedItem.investigation || "";
  const currentInvestigation = formInvestigation || selectedItemInvestigation;
  const hasInvestigation = Boolean(currentInvestigation && currentInvestigation.trim().length > 0);
  const hasDispositions = Boolean(selectedItem.dispositions && selectedItem.dispositions.length > 0);
  const canClose = hasInvestigation && hasDispositions;

  const renderStatusButtons = () => {
    if (!canEditSelected) return null;

    if (selectedItem.status === "open") {
      return (
        <Button type="primary" loading={isLoading} onClick={() => onStatusTransition("investigating")}>
          開始調查
        </Button>
      );
    }

    if (selectedItem.status === "investigating") {
      return (
        <Button type="primary" loading={isLoading} onClick={() => onStatusTransition("pending_confirmation")}>
          送待確認
        </Button>
      );
    }

    if (selectedItem.status === "pending_confirmation") {
      return (
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <Space wrap>
            <Button disabled={isLoading} onClick={() => onStatusTransition("investigating")}>
              退回調查
            </Button>
            <Button
              type="primary"
              loading={isLoading}
              disabled={!canClose}
              title={
                !canClose
                  ? !hasInvestigation
                    ? "需要先填寫調查內容"
                    : "需要先新增至少一筆處置記錄"
                  : undefined
              }
              onClick={() => onStatusTransition("closed")}
            >
              結案
            </Button>
          </Space>
          {!canClose && (
            <Text type="warning">
              {!hasInvestigation && "請先填寫調查內容；"}
              {!hasDispositions && "請先新增至少一筆處置記錄；"}
              完成後才能結案
            </Text>
          )}
        </Space>
      );
    }

    return null;
  };

  return (
    <Modal
      open={!!selectedItem}
      onCancel={() => {
        if (!isLoading) onClose();
      }}
      title={
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {selectedItem.case_no} · {selectedItem.title}
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            發現 {new Date(selectedItem.found_at).toLocaleString()} · 發現人 ID{" "}
            {selectedItem.found_by_user_id}
          </Text>
        </div>
      }
      width={900}
      footer={null}
      destroyOnHidden
      mask={{ closable: !isLoading }}
      keyboard={!isLoading}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
    >
      <Space orientation="vertical" size={20} style={{ width: "100%" }}>
        {/* 基本資訊 */}
        <Space wrap size="middle">
          <StatusBadge value={selectedItem.status} />
          <Text>來源：{selectedItem.source}</Text>
          <SeverityBadge value={selectedItem.severity} />
          <Text>不良數量：{selectedItem.defect_qty ?? "未填"}</Text>
        </Space>

        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="供應商">{selectedItem.supplier_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="物料">{selectedItem.material_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="收料紀錄">{selectedItem.receipt_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="供應商批號">{selectedItem.supplier_lot_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="內部批號">{selectedItem.internal_lot_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="IQC">{selectedItem.iqc_record_id ?? "—"}</Descriptions.Item>
        </Descriptions>

        {/* 編輯／唯讀內容 */}
        <form onSubmit={onSaveInvestigation} noValidate>
          {canEditSelected ? (
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="案件標題" error={editErrors.title?.message}>
                <input className={inputClass} maxLength={200} {...registerEdit("title")} />
              </FormField>
              <FormField label="嚴重程度" error={editErrors.severity?.message}>
                <select className={inputClass} {...registerEdit("severity")}>
                  {SEVERITY_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="md:col-span-2">
                <FormField label="異常描述" error={editErrors.description?.message}>
                  <textarea rows={3} className={inputClass} {...registerEdit("description")} />
                </FormField>
              </div>
            </div>
          ) : (
            <div>
              <Text strong>異常描述</Text>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {selectedItem.description}
              </p>
            </div>
          )}

          <Divider titlePlacement="start" plain>
            調查內容
          </Divider>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <FormField label="調查內容" error={editErrors.investigation?.message}>
              {!canEditSelected ? (
                <p className="whitespace-pre-wrap text-sm">
                  {selectedItem.investigation || "無調查內容"}
                </p>
              ) : (
                <textarea
                  className={inputClass}
                  rows={3}
                  aria-label="調查內容"
                  placeholder="調查內容"
                  {...registerEdit("investigation")}
                />
              )}
            </FormField>
            {canEditSelected && (
              <button type="submit" className={`${buttonClass} self-end`} disabled={isLoading}>
                儲存調查
              </button>
            )}
          </div>
        </form>

        {/* 狀態操作 */}
        {renderStatusButtons()}

        <Divider titlePlacement="start" plain>
          圍堵與處置紀錄
        </Divider>

        {canEditSelected && (
          <form className="grid gap-3 md:grid-cols-3" onSubmit={onAddDisposition}>
            <FormField label="處置內容" error={dispositionErrors.content?.message}>
              <input className={inputClass} {...registerDisposition("content")} />
            </FormField>
            <FormField label="處置結果" error={dispositionErrors.result?.message}>
              <input className={inputClass} {...registerDisposition("result")} />
            </FormField>
            <FormField label="執行時間" error={dispositionErrors.executed_at?.message}>
              <input type="datetime-local" className={inputClass} {...registerDisposition("executed_at")} />
            </FormField>
            <button type="submit" className={buttonClass} disabled={isLoading}>
              新增處置紀錄
            </button>
          </form>
        )}

        {selectedItem.dispositions?.length ? (
          <Timeline
            items={selectedItem.dispositions.map((d) => ({
              content: (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(d.executed_at).toLocaleString()} 繚 鞎痊鈭?ID {d.owner_user_id}
                  </Text>
                  <div>
                    {d.content} ??{d.result}
                  </div>
                </div>
              ),
            }))}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無處置紀錄" />
        )}

        <Divider titlePlacement="start" plain>
          附件
        </Divider>

        {canEditSelected && (
          <label className={secondaryButtonClass + " cursor-pointer inline-flex"}>
            上傳附件（PDF／PNG／JPEG）
            <input
              className="sr-only"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => onUploadAttachment(e.target.files?.[0])}
            />
          </label>
        )}

        {selectedItem.attachments?.length ? (
          <Space orientation="vertical" size={4}>
            {selectedItem.attachments.map((a) => (
              <Space key={a.id}>
                <Button type="link" onClick={() => onDownloadAttachment(a.id, a.original_filename)}>
                  {a.original_filename}
                </Button>
                {canModify && (
                  <Button type="link" danger onClick={() => onRemoveAttachment(a.id)}>
                    刪除
                  </Button>
                )}
              </Space>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無附件" />
        )}

        <Divider titlePlacement="start" plain>
          案件歷程
        </Divider>

        {selectedItem.history?.length ? (
          <Timeline
            items={selectedItem.history.map((h) => {
              const beforeText = formatHistoryValue(h.before_data);
              const afterText = formatHistoryValue(h.after_data);
              return {
                content: (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(h.created_at).toLocaleString()} 繚 雿輻??{h.actor_user_id}
                    </Text>
                    <div>{h.action}</div>
                    {(beforeText || afterText) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-500">霈??鞈?</summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs">
                          {beforeText || "—"} → {afterText || "—"}
                        </pre>
                      </details>
                    )}
                  </div>
                ),
              };
            })}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無歷程" />
        )}
      </Space>
    </Modal>
  );
}