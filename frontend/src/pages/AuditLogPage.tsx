import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Eye } from "lucide-react";
import { api, ApiError } from "../api/client";
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
    start_at: filters.start_at ? new Date(filters.start_at).toISOString() : undefined,
    end_at: filters.end_at ? new Date(filters.end_at).toISOString() : undefined,
  };
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("zh-TW", { hour12: false });
}

function jsonContent(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "（無）";
}

export function AuditLogPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const params = useMemo(() => filterParams(filters), [filters]);
  useEffect(() => {
    let active = true;
    void api
      .listAuditLogs({ ...params, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
      setItems(result.items);
      setHasNext(result.items.length === PAGE_SIZE);
      setSelected((current) =>
        current ? result.items.find((item) => item.id === current.id) ?? null : null,
      );
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.details : "稽核紀錄載入失敗，請稍後重試。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, params, refresh]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPage(1);
    setSelected(null);
    setFilters({ ...draft });
  };

  const retryLoad = () => {
    setLoading(true);
    setError("");
    setRefresh((value) => value + 1);
  };

  const changePage = (nextPage: number) => {
    setLoading(true);
    setError("");
    setPage(nextPage);
  };

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const blob = await api.exportAuditLogs(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smtms-audit-logs.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.details : "稽核紀錄匯出失敗，請稍後重試。");
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
          <button className={secondaryButtonClass} onClick={() => void exportCsv()} disabled={exporting}>
            <Download className="h-4 w-4" />{exporting ? "匯出中…" : "匯出篩選結果 CSV"}
          </button>
        }
      />
      <div className="space-y-5">
        <Panel title="篩選條件" description="條件會同時套用於清單與 CSV 匯出。">
          <form onSubmit={submitFilters} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <FormField label="操作者帳號">
              <input className={inputClass} value={draft.actor_username} onChange={(event) => setDraft({ ...draft, actor_username: event.target.value })} />
            </FormField>
            <FormField label="操作類型">
              <select className={inputClass} value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })}>
                <option value="">全部</option><option value="CREATE">CREATE</option><option value="UPDATE">UPDATE</option><option value="DELETE">DELETE</option><option value="LOGIN">LOGIN</option>
              </select>
            </FormField>
            <FormField label="資源類型">
              <input className={inputClass} value={draft.resource_type} onChange={(event) => setDraft({ ...draft, resource_type: event.target.value })} placeholder="例如 materials" />
            </FormField>
            <FormField label="開始時間">
              <input className={inputClass} type="datetime-local" value={draft.start_at} onChange={(event) => setDraft({ ...draft, start_at: event.target.value })} />
            </FormField>
            <FormField label="結束時間">
              <input className={inputClass} type="datetime-local" value={draft.end_at} onChange={(event) => setDraft({ ...draft, end_at: event.target.value })} />
            </FormField>
            <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
              <button className={buttonClass} type="submit">套用篩選</button>
              <button className={secondaryButtonClass} type="button" onClick={() => { setLoading(true); setError(""); setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); setSelected(null); setRefresh((value) => value + 1); }}>清除</button>
            </div>
          </form>
        </Panel>

        {error && <ErrorState message={error} onRetry={retryLoad} />}
        <Panel title="操作紀錄" description={`第 ${page} 頁 · 每頁 ${PAGE_SIZE} 筆`}>
          {loading ? <LoadingState label="稽核紀錄載入中…" /> : items.length === 0 ? <EmptyState title="沒有符合條件的稽核紀錄" /> : (
            <>
              <DataTable>
                <TableHead><tr><Th>操作時間</Th><Th>操作者</Th><Th>操作類型</Th><Th>資源類型</Th><Th>資源 ID</Th><Th>明細</Th></tr></TableHead>
                <TableBody>{items.map((item) => (
                  <TableRow key={item.id}>
                    <Td className="whitespace-nowrap">{formatTimestamp(item.created_at)}</Td>
                    <Td>{item.actor_username ?? (item.actor_user_id ? `user:${item.actor_user_id}` : "系統")}</Td>
                    <Td><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{item.action}</span></Td>
                    <Td>{item.resource_type}</Td>
                    <Td>{item.resource_id ?? "—"}</Td>
                    <Td><button className="inline-flex items-center gap-1 text-sky-700 underline" onClick={() => setSelected(selected?.id === item.id ? null : item)} aria-label={`查看紀錄 ${item.id}`}><Eye className="h-4 w-4" />查看</button></Td>
                  </TableRow>
                ))}</TableBody>
              </DataTable>
              <div className="mt-4 flex items-center justify-between">
                <button className={secondaryButtonClass} disabled={page <= 1 || loading} onClick={() => changePage(Math.max(1, page - 1))}>上一頁</button>
                <span className="text-sm text-slate-500">第 {page} 頁</span>
                <button className={secondaryButtonClass} disabled={!hasNext || loading} onClick={() => changePage(page + 1)}>下一頁</button>
              </div>
              {selected && <section aria-label="稽核紀錄明細" className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">紀錄 #{selected.id} 明細</h3><button className="text-sm text-slate-600 underline" onClick={() => setSelected(null)}>關閉明細</button></div>
                <p className="mt-1 text-xs text-slate-500">Request ID：{selected.request_id ?? "—"}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div><h4 className="text-sm font-semibold">異動前</h4><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-3 text-xs">{jsonContent(selected.before_data)}</pre></div>
                  <div><h4 className="text-sm font-semibold">異動後</h4><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-3 text-xs">{jsonContent(selected.after_data)}</pre></div>
                </div>
              </section>}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
