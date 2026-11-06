import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { Modal, Tag } from "antd";
import { api, ApiError } from "../api";
import type { AuditLog } from "../types";
import {
  buttonClass,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  secondaryButtonClass,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../components/ui";

type Filters = {
  actor_username: string;
  action: string;
  resource_type: string;
  start_at: string;
  end_at: string;
};

const PAGE_SIZE = 20;
const EMPTY_FILTERS: Filters = {
  actor_username: "",
  action: "",
  resource_type: "",
  start_at: "",
  end_at: "",
};

function filterParams(filters: Filters) {
  return {
    actor_username: filters.actor_username.trim() || undefined,
    action: filters.action || undefined,
    resource_type: filters.resource_type.trim() || undefined,
    start_at: filters.start_at
      ? new Date(filters.start_at).toISOString()
      : undefined,
    end_at: filters.end_at
      ? new Date(filters.end_at).toISOString()
      : undefined,
  };
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("zh-TW", { hour12: false });
}

function jsonContent(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "（無）";
}

function actionTagColor(action: string) {
  switch (action) {
    case "CREATE":
      return "green";
    case "UPDATE":
      return "blue";
    case "DELETE":
      return "red";
    case "LOGIN":
      return "gold";
    default:
      return "default";
  }
}

export function AuditLogPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [filterError, setFilterError] = useState("");

  const params = filterParams(filters);

  const {
    data: result,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["audit-logs", { page, page_size: PAGE_SIZE, ...params }],
    queryFn: async () => {
      const response = await api.listAuditLogs({
        ...params,
        page,
        page_size: PAGE_SIZE,
      });
      return response;
    },
    retry: 1,
    staleTime: 30 * 1000,
  });

  const items = result?.items ?? [];
  const hasNext = items.length === PAGE_SIZE;

  const listErrorMessage = queryError
    ? queryError instanceof ApiError
      ? queryError.details
      : "稽核紀錄載入失敗，請稍後重試"
    : null;

  function validateFilters(filters: Filters): string | null {
    if (filters.start_at && filters.end_at && filters.start_at > filters.end_at) {
      return "開始時間不可晚於結束時間";
    }
    return null;
  }

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilterError("");
    const validationError = validateFilters(draft);
    if (validationError) {
      setFilterError(validationError);
      return;
    }
    setPage(1);
    setSelected(null);
    setFilters({ ...draft });
  };

  const retryLoad = () => {
    void refetch();
  };

  const retryExport = () => {
    setExportError("");
    void exportCsv();
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
  };

  const exportCsv = async () => {
    const validationError = validateFilters(filters);
    if (validationError) {
      // CSV 匯出驗證失敗寫入 exportError，不污染 filterError
      setExportError(validationError);
      return;
    }
    setExporting(true);
    setExportError("");
    try {
      const blob = await api.exportAuditLogs(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smtms-audit-logs.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL?.(url), 100);
    } catch (cause) {
      setExportError(
        cause instanceof ApiError
          ? cause.details
          : "稽核紀錄匯出失敗，請稍後再試",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="系統設定"
        title="稽核紀錄"
        description="檢視系統操作、異動內容與操作者。稽核紀錄僅供查詢。"
        action={
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? "匯出中…" : "匯出篩選結果 CSV"}
          </button>
        }
      />

      <div className="space-y-5">
        <Panel
          title="篩選條件"
          description="條件會同時套用於清單與 CSV 匯出。"
        >
          <form
            onSubmit={submitFilters}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            <FormField label="操作者帳號">
              <input
                className={inputClass}
                value={draft.actor_username}
                onChange={(event) => {
                  setDraft((prev) => ({
                    ...prev,
                    actor_username: event.target.value,
                  }));
                  setFilterError("");
                }}
              />
            </FormField>
            <FormField label="操作類型">
              <select
                className={inputClass}
                value={draft.action}
                onChange={(event) => {
                  setDraft((prev) => ({
                    ...prev,
                    action: event.target.value,
                  }));
                  setFilterError("");
                }}
              >
                <option value="">全部</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="LOGIN">LOGIN</option>
              </select>
            </FormField>
            <FormField label="資源類型">
              <input
                className={inputClass}
                value={draft.resource_type}
                onChange={(event) => {
                  setDraft((prev) => ({
                    ...prev,
                    resource_type: event.target.value,
                  }));
                  setFilterError("");
                }}
                placeholder="例如 materials"
              />
            </FormField>
            <FormField label="開始時間">
              <input
                className={inputClass}
                type="datetime-local"
                value={draft.start_at}
                onChange={(event) => {
                  setDraft((prev) => ({
                    ...prev,
                    start_at: event.target.value,
                  }));
                  setFilterError("");
                }}
              />
            </FormField>
            <FormField label="結束時間">
              <input
                className={inputClass}
                type="datetime-local"
                value={draft.end_at}
                onChange={(event) => {
                  setDraft((prev) => ({
                    ...prev,
                    end_at: event.target.value,
                  }));
                  setFilterError("");
                }}
              />
            </FormField>
            <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
              <button type="submit" className={buttonClass}>
                套用篩選
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setFilterError("");
                  setExportError("");
                  setDraft(EMPTY_FILTERS);
                  setFilters(EMPTY_FILTERS);
                  setPage(1);
                  setSelected(null);
                }}
              >
                清除
              </button>
            </div>
          </form>
          {filterError && <ErrorState message={filterError} />}
        </Panel>

        {exportError && (
          <ErrorState message={exportError} onRetry={retryExport} />
        )}

        <Panel
          title="稽核紀錄"
          description={`第 ${page} 頁 · 每頁 ${PAGE_SIZE} 筆`}
        >
          {listErrorMessage && (
            <ErrorState message={listErrorMessage} onRetry={retryLoad} />
          )}
          {loading ? (
            <LoadingState label="稽核紀錄載入中…" />
          ) : items.length === 0 ? (
            <EmptyState title="沒有符合條件的稽核紀錄" />
          ) : (
            <>
              <DataTable>
                <TableHead>
                  <tr>
                    <Th>操作時間</Th>
                    <Th>操作者</Th>
                    <Th>操作類型</Th>
                    <Th>資源類型</Th>
                    <Th>資源 ID</Th>
                    <Th>明細</Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <Td className="whitespace-nowrap">
                        {formatTimestamp(item.created_at)}
                      </Td>
                      <Td>
                        {item.actor_username ??
                          (item.actor_user_id
                            ? `user:${item.actor_user_id}`
                            : "系統")}
                      </Td>
                      <Td>
                        <Tag color={actionTagColor(item.action)}>{item.action}</Tag>
                      </Td>
                      <Td>{item.resource_type}</Td>
                      <Td>{item.resource_id ?? "—"}</Td>
                      <Td>
                        <button
                          className="inline-flex items-center gap-1 text-sky-700 underline"
                          onClick={() => setSelected(item)}
                          aria-label={`查看紀錄 ${item.id}`}
                        >
                          <Eye className="h-4 w-4" />
                          查看
                        </button>
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={page <= 1}
                  onClick={() => changePage(Math.max(1, page - 1))}
                >
                  上一頁
                </button>
                <span className="text-sm text-slate-500">第 {page} 頁</span>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={!hasNext}
                  onClick={() => changePage(page + 1)}
                >
                  下一頁
                </button>
              </div>
            </>
          )}
        </Panel>
      </div>

      <Modal
        open={selected !== null}
        title="稽核紀錄明細"
        onCancel={() => setSelected(null)}
        footer={null}
        destroyOnHidden
        width={860}
      >
        {selected && (
          <div className="space-y-5">
            <p className="-mt-2 text-sm text-slate-500">紀錄 #{selected.id}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-medium text-slate-500">操作時間</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {formatTimestamp(selected.created_at)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-medium text-slate-500">操作者</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {selected.actor_username ??
                    (selected.actor_user_id
                      ? `user:${selected.actor_user_id}`
                      : "系統")}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-medium text-slate-500">操作類型</p>
                <p className="mt-1">
                  <Tag color={actionTagColor(selected.action)}>{selected.action}</Tag>
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-medium text-slate-500">資源類型</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {selected.resource_type}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-medium text-slate-500">資源 ID</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {selected.resource_id ?? "—"}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:col-span-3">
                <p className="text-xs font-medium text-slate-500">Request ID</p>
                <p className="mt-1 break-all text-sm font-medium text-slate-900">
                  {selected.request_id ?? "—"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h4 className="text-sm font-semibold text-slate-900">異動前</h4>
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-xs text-slate-700">
                  {jsonContent(selected.before_data)}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h4 className="text-sm font-semibold text-slate-900">異動後</h4>
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-xs text-slate-700">
                  {jsonContent(selected.after_data)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}