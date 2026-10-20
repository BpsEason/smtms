import { useState, type FormEvent } from "react";
import { RefreshCw, Search } from "lucide-react";
import { api } from "../api/client";
import { buildTraceabilityPageCsv } from "../lib/traceabilityCsv";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  secondaryButtonClass,
  StatusBadge,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../components/ui";
import type { PaginatedResponse, TraceabilityReceipt } from "../types";

const identifiers = [
  ["receipt_no", "收料單號"],
  ["supplier_lot_no", "供應商批號"],
  ["internal_lot_no", "內部批號"],
  ["iqc_id", "IQC 編號"],
  ["material_code", "物料代碼"],
] as const;
type Identifier = (typeof identifiers)[number][0];

export function TraceabilityPage() {
  const [identifier, setIdentifier] = useState<Identifier>("receipt_no");
  const [value, setValue] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState<{ key: Identifier; value: string } | null>(null);
  const [result, setResult] = useState<PaginatedResponse<TraceabilityReceipt> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async (event?: FormEvent<HTMLFormElement>, nextPage = 1) => {
    event?.preventDefault();
    const searchValue = event ? value.trim() : query?.value ?? value.trim();
    const searchKey = event ? identifier : query?.key ?? identifier;
    if (!searchValue) { setError("請輸入一個追溯識別值。"); return; }
    setLoading(true); setError("");
    try {
      const rows = await api.searchTraceability({ [searchKey]: searchValue, page: nextPage, page_size: 20 });
      setQuery({ key: searchKey, value: searchValue }); setPage(nextPage); setResult(rows);
    } catch (err) { setResult(null); setError(err instanceof Error ? err.message : "追溯查詢失敗。"); }
    finally { setLoading(false); }
  };
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.page_size ?? 20)));

  const exportCurrentPage = () => {
    if (!result) return;
    const blob = new Blob(["\ufeff", buildTraceabilityPageCsv(result.items)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `smtms-traceability-page-${page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section>
    <PageHeader eyebrow="品保追溯" title="全鏈路追溯查詢" description="以供應商批號、收料單、內部批號、IQC 編號或物料代碼查詢完整來源與檢驗分支。" />
    <Panel title="查詢條件" description="一次使用一種識別條件；查詢結果依權限及供應商資料範圍過濾。" className="mb-5">
      <form onSubmit={(event) => void runSearch(event)} className="flex flex-wrap items-end gap-3">
        <FormField label="識別條件"><select className={inputClass} value={identifier} onChange={(event) => setIdentifier(event.target.value as Identifier)}>{identifiers.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormField>
        <FormField label="識別值"><input className={inputClass} value={value} onChange={(event) => setValue(event.target.value)} required maxLength={120} placeholder="輸入完整識別值" /></FormField>
        <button className="inline-flex min-h-9 items-center gap-2 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50" disabled={loading}><Search className="h-4 w-4" />{loading ? "查詢中…" : "查詢追溯鏈"}</button>
        <button type="button" className={secondaryButtonClass} disabled={loading || !query} onClick={() => void runSearch(undefined, page)}><RefreshCw className="h-4 w-4" />重新整理</button>
      </form>
    </Panel>
    {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void runSearch()} /></div>}
    <Panel title="追溯鏈結果" description={result ? `共 ${result.total} 筆收料主鏈 · 每筆收料均保留各內部分批與 IQC 關係；CSV 僅包含本頁 ${result.items.length} 筆` : "供應商 → 物料 → 供應商批號 → 收料 → 內部批號 → IQC／簽核歷程"} action={result && <button type="button" className={secondaryButtonClass} onClick={exportCurrentPage}>匯出當前頁 CSV</button>}>
      {loading ? <LoadingState label="正在載入完整追溯鏈…" /> : result?.items.length ? <div className="space-y-5">{result.items.map((entry) => <article key={entry.receipt.id} className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="供應商" value={`${entry.supplier.supplier_code} · ${entry.supplier.supplier_name}`} /><Metric label="物料" value={`${entry.material.material_code} · ${entry.material.material_name}`} /><Metric label="供應商批號／申報量" value={`${entry.supplier_lot.supplier_lot_no} · ${entry.supplier_lot.qty_received} ${entry.supplier_lot.uom}`} /><Metric label="收料單／收料量" value={`${entry.receipt.receipt_no} · ${entry.receipt.qty_received} ${entry.supplier_lot.uom}`} /></div>
        <div className="p-4"><h3 className="mb-3 text-sm font-semibold text-slate-900">內部批號分支（{entry.internal_lots.length}）</h3>{entry.internal_lots.length ? <DataTable><TableHead><TableRow><Th>內部批號</Th><Th>拆分量</Th><Th>批號狀態</Th><Th>IQC／放行結果</Th><Th>審核歷程</Th></TableRow></TableHead><TableBody>{entry.internal_lots.map(({ internal_lot, iqc_records }) => <TableRow key={internal_lot.id}><Td className="font-medium text-slate-950">{internal_lot.internal_lot_no}</Td><Td>{internal_lot.qty_on_hand} {internal_lot.uom}</Td><Td><StatusBadge value={internal_lot.lot_status} /></Td><Td>{iqc_records.length ? <div className="space-y-2">{iqc_records.map(({ iqc_record }) => <p key={iqc_record.id}>IQC-{iqc_record.id} · <StatusBadge value={iqc_record.inspection_result} /> <StatusBadge value={iqc_record.release_status} /></p>)}</div> : "尚無 IQC"}</Td><Td>{iqc_records.some((item) => item.review_history.length) ? <div className="space-y-2">{iqc_records.flatMap(({ iqc_record, review_history }) => review_history.map((review) => <p key={review.id}>IQC-{iqc_record.id} · <StatusBadge value={review.review_status} /> · {review.reason || review.decision_note || "無意見"}</p>))}</div> : "尚無簽核"}</Td></TableRow>)}</TableBody></DataTable> : <EmptyState title="此收料尚未拆分內部批號" />}</div>
      </article>)}<div className="flex items-center justify-between text-xs text-slate-500"><span>第 {page} / {pages} 頁</span><div className="flex gap-2"><button className={secondaryButtonClass} disabled={page <= 1 || loading} onClick={() => void runSearch(undefined, page - 1)}>上一頁</button><button className={secondaryButtonClass} disabled={page >= pages || loading} onClick={() => void runSearch(undefined, page + 1)}>下一頁</button></div></div></div> : error ? null : <EmptyState title="尚未執行追溯查詢" description="選擇識別條件並輸入識別值，即可查詢完整資料鏈。" />}
    </Panel>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value}</p></div>;
}
