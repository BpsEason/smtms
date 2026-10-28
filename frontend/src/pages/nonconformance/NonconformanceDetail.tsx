import { Button } from "../../components/shadcn/button";
import {
  Panel,
  FormField,
  StatusBadge,
  inputClass,
} from "../../components/ui";
import type { NonconformanceDetailProps } from "./types";
import { SEVERITY_OPTIONS } from "./constants";

export function NonconformanceDetail({
  selectedItem,
  isLoading,
  canEditSelected,
  canModify,
  editForm,
  investigationContent,
  dispositionForm,
  onUpdateEditForm,
  onUpdateInvestigationContent,
  onUpdateDispositionForm,
  onSaveInvestigation,
  onStatusTransition,
  onAddDisposition,
  onUploadAttachment,
  onDownloadAttachment,
  onRemoveAttachment,
}: NonconformanceDetailProps) {
  if (!selectedItem) return null;

  // 渲染狀態轉換按鈕
  const renderStatusButtons = () => {
    if (!canEditSelected) return null;

    if (selectedItem.status === "open") {
      return (
        <Button
          disabled={isLoading}
          onClick={() => onStatusTransition("investigating")}
        >
          開始調查
        </Button>
      );
    }

    if (selectedItem.status === "investigating") {
      return (
        <Button
          disabled={isLoading}
          onClick={() => onStatusTransition("pending_confirmation")}
        >
          送待確認
        </Button>
      );
    }

    if (selectedItem.status === "pending_confirmation") {
      // 檢查是否滿足結案條件：需要有調查內容和至少一筆處置記錄
      const hasInvestigation = investigationContent && investigationContent.trim().length > 0;
      const hasDispositions = selectedItem.dispositions && selectedItem.dispositions.length > 0;
      const canClose = hasInvestigation && hasDispositions;
      
      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={isLoading}
              onClick={() => onStatusTransition("investigating")}
            >
              退回調查
            </Button>
            <Button
              disabled={isLoading || !canClose}
              onClick={() => onStatusTransition("closed")}
              title={!canClose ? (
                !hasInvestigation ? "需要先填寫調查內容" : "需要先新增至少一筆處置記錄"
              ) : ""}
            >
              結案
            </Button>
          </div>
          {!canClose && (
            <p className="text-sm text-amber-600">
              {!hasInvestigation && "請先填寫調查內容；"}
              {!hasDispositions && "請先新增至少一筆處置記錄；"}
              完成後才能結案
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  // 渲染編輯表單
  const renderEditForm = () => {
    if (!canEditSelected) {
      return <p className="whitespace-pre-wrap text-sm">{selectedItem.description}</p>;
    }

    return (
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="案件標題">
          <input
            className={inputClass}
            value={editForm.title}
            onChange={(e) => onUpdateEditForm("title", e.target.value)}
          />
        </FormField>

        <FormField label="嚴重程度">
          <select
            className={inputClass}
            value={editForm.severity}
            onChange={(e) => onUpdateEditForm("severity", e.target.value)}
          >
            {SEVERITY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </FormField>

        <div className="md:col-span-2">
          <FormField label="異常描述">
            <textarea
              rows={3}
              className={inputClass}
              value={editForm.description}
              onChange={(e) => onUpdateEditForm("description", e.target.value)}
            />
          </FormField>
        </div>
      </div>
    );
  };

  // 渲染處置記錄表單
  const renderDispositionForm = () => {
    if (!canEditSelected) return null;

    return (
      <form
        className="grid gap-3 border-t pt-4 md:grid-cols-3"
        onSubmit={onAddDisposition}
      >
        <FormField label="處置內容">
          <input
            required
            className={inputClass}
            value={dispositionForm.content}
            onChange={(e) => onUpdateDispositionForm("content", e.target.value)}
          />
        </FormField>

        <FormField label="處置結果">
          <input
            required
            className={inputClass}
            value={dispositionForm.result}
            onChange={(e) => onUpdateDispositionForm("result", e.target.value)}
          />
        </FormField>

        <FormField label="執行時間">
          <input
            required
            type="datetime-local"
            className={inputClass}
            value={dispositionForm.executed_at}
            onChange={(e) => onUpdateDispositionForm("executed_at", e.target.value)}
          />
        </FormField>

        <Button disabled={isLoading}>
          新增處置紀錄
        </Button>
      </form>
    );
  };

  // 渲染附件上傳區
  const renderAttachmentUpload = () => {
    if (!canEditSelected) return null;

    return (
        <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
          上傳附件（PDF／PNG／JPEG）
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => onUploadAttachment(e.target.files?.[0])}
          />
        </label>
    );
  };

  return (
    <Panel
      title={`${selectedItem.case_no} · ${selectedItem.title}`}
      description={`發現 ${new Date(selectedItem.found_at).toLocaleString()} · 發現人 ID ${selectedItem.found_by_user_id}`}
    >
      <div className="space-y-5">
        {/* 基本資訊標籤 */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge value={selectedItem.status} />
          <span>來源：{selectedItem.source}</span>
          <span>嚴重程度：{selectedItem.severity}</span>
          <span>不良數量：{selectedItem.defect_qty ?? "未填"}</span>
        </div>

        {/* 關聯ID資訊 */}
        <p className="text-xs text-slate-500">
          關聯 ID：供應商 {selectedItem.supplier_id ?? "—"} · 物料{" "}
          {selectedItem.material_id ?? "—"} · 收料紀錄{" "}
          {selectedItem.receipt_id ?? "—"} · 供應商批號{" "}
          {selectedItem.supplier_lot_id ?? "—"} · 內部批號{" "}
          {selectedItem.internal_lot_id ?? "—"} · IQC{" "}
          {selectedItem.iqc_record_id ?? "—"}
        </p>

        {/* 編輯表單 */}
        {renderEditForm()}

        {/* 調查內容區 */}
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <textarea
            className={inputClass}
            rows={3}
            aria-label="調查內容"
            placeholder="調查內容"
            value={investigationContent}
            onChange={(e) => onUpdateInvestigationContent(e.target.value)}
            disabled={!canEditSelected}
          />

          {canEditSelected && (
            <Button
              variant="secondary"
              disabled={isLoading}
              onClick={() => onSaveInvestigation()}
            >
              儲存調查
            </Button>
          )}
        </div>

        {/* 狀態轉換按鈕 */}
        {renderStatusButtons()}

        {/* 處置記錄表單 */}
        {renderDispositionForm()}

        {/* 處置記錄列表 */}
        <div>
          <h3 className="mb-2 font-semibold">圍堵與處置紀錄</h3>
          {selectedItem.dispositions?.map((d) => (
            <p key={d.id} className="border-t py-2 text-sm">
              {new Date(d.executed_at).toLocaleString()} · {d.content} —{" "}
              {d.result}（負責人 ID {d.owner_user_id}）
            </p>
          ))}
        </div>

        {/* 附件上傳 */}
        {renderAttachmentUpload()}

        {/* 附件列表 */}
        <div>
          <h3 className="mb-2 font-semibold">附件</h3>
          {selectedItem.attachments?.map((a) => (
            <span
              key={a.id}
              className="mr-3 inline-flex items-center gap-2"
            >
              <button
                className="text-sm text-sky-700 underline"
                onClick={() => onDownloadAttachment(a.id, a.original_filename)}
              >
                {a.original_filename}
              </button>
              {canModify && (
                <button
                  aria-label={`刪除附件 ${a.original_filename}`}
                  className="text-xs text-rose-700 underline"
                  onClick={() => onRemoveAttachment(a.id)}
                >
                  刪除
                </button>
              )}
            </span>
          ))}
        </div>

        {/* 案件歷程 */}
        <div>
          <h3 className="mb-2 font-semibold">案件歷程</h3>
          {selectedItem.history?.map((h) => (
            <p key={h.id} className="border-t py-2 text-xs text-slate-600">
              {new Date(h.created_at).toLocaleString()} · 使用者{" "}
              {h.actor_user_id} · {h.action}
              {h.before_data && (
                <details className="mt-1">
                  <summary>變更前後資料</summary>
                  <pre className="overflow-auto">
                    {h.before_data} → {h.after_data}
                  </pre>
                </details>
              )}
            </p>
          ))}
        </div>
      </div>
    </Panel>
  );
}