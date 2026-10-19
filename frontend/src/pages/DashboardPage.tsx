import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, ClipboardCheck, PackageCheck, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { DataTable, EmptyState, ErrorState, LoadingState, Metric, PageHeader, Panel, StatusBadge, TableBody, TableHead, TableRow, Td, Th } from '../components/ui'
import type { InternalLot, IQCRecord, PaginatedResponse, Receipt, UserProfile } from '../types'

export function DashboardPage({ profile }: { profile: UserProfile | null }) {
  const [receipts, setReceipts] = useState<PaginatedResponse<Receipt> | null>(null)
  const [lots, setLots] = useState<PaginatedResponse<InternalLot> | null>(null)
  const [iqc, setIqc] = useState<PaginatedResponse<IQCRecord> | null>(null)
  const [pending, setPending] = useState<PaginatedResponse<IQCRecord> | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const can = useCallback((permission: string) => Boolean(profile?.permissions.includes(permission)), [profile])

  const load = useCallback(async () => {
    if (!profile) return
    const requests = [
      can('receipts:read') ? api.listReceipts({ page: 1, page_size: 8 }).then(setReceipts).catch((error) => setErrors((current) => [...current, `Receipts: ${message(error)}`])) : Promise.resolve(),
      can('materials:read') ? api.listInternalLots({ page: 1, page_size: 1 }).then(setLots).catch((error) => setErrors((current) => [...current, `Internal lots: ${message(error)}`])) : Promise.resolve(),
      can('iqc:read') ? api.listIQCRecords({ page: 1, page_size: 1 }).then(setIqc).catch((error) => setErrors((current) => [...current, `IQC: ${message(error)}`])) : Promise.resolve(),
      can('iqc:read') ? api.listIQCRecords({ result: 'pending', page: 1, page_size: 1 }).then(setPending).catch((error) => setErrors((current) => [...current, `Pending inspections: ${message(error)}`])) : Promise.resolve(),
    ]
    await Promise.all(requests)
    setLoading(false)
  }, [can, profile])
  useEffect(() => { const timer = window.setTimeout(() => { void load() }, 0); return () => window.clearTimeout(timer) }, [load])

  const metrics = [
    can('receipts:read') && receipts && { label: 'Receipts', value: receipts.total, detail: 'Total records returned by receipt query' },
    can('materials:read') && lots && { label: 'Internal lots', value: lots.total, detail: 'Total internal lot records' },
    can('iqc:read') && iqc && { label: 'IQC records', value: iqc.total, detail: 'Total inspection records' },
    can('iqc:read') && pending && { label: 'Pending inspections', value: pending.total, detail: 'Records with pending inspection result' },
  ].filter((item): item is { label: string; value: number; detail: string } => Boolean(item))

  return <section>
    <PageHeader eyebrow="Quality operations" title="Overview" description="Operational snapshot from live records. Counts reflect the current API query; quality KPIs and trend aggregates are not available." action={<button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setLoading(true); setErrors([]); void load() }}><RefreshCw className="h-4 w-4" />Refresh</button>} />
    {loading ? <LoadingState label="Loading live operational data…" /> : null}
    {errors.length > 0 && <div className="mb-5 space-y-2">{errors.map((error) => <ErrorState key={error} message={error} />)}</div>}
    {!loading && metrics.length === 0 ? <Panel title="Data access unavailable" description="Dashboard figures are only shown when the current account can read their source records."><EmptyState title="No readable quality data" description="Request read permissions for receipts, materials or IQC to populate this overview." /></Panel> : <div className="mb-6 grid grid-cols-1 gap-6 border-y border-slate-200 bg-white py-5 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Metric key={metric.label} {...metric} />)}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
      {can('receipts:read') && <Panel title="Recent receipts" description="Latest entries from the current receipt list response." action={<Link to="/receipts" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 hover:text-sky-950">Open receipts <ArrowUpRight className="h-3.5 w-3.5" /></Link>}>
        {loading ? <LoadingState /> : receipts?.items.length ? <DataTable><TableHead><TableRow><Th>Receipt</Th><Th>Received</Th><Th>Remaining</Th><Th>Status</Th></TableRow></TableHead><TableBody>{receipts.items.slice(0, 6).map((receipt) => <TableRow key={receipt.id}><Td className="font-medium text-slate-900">{receipt.receipt_no}</Td><Td>{new Date(receipt.received_at).toLocaleDateString()}</Td><Td>{receipt.qty_remaining}</Td><Td><StatusBadge value={receipt.status} /></Td></TableRow>)}</TableBody></DataTable> : <EmptyState title="No receipt records" description="Receipts will appear here after they are registered." />}
      </Panel>}
      <Panel title="Quality work queue" description="Pending IQC count is filtered by the backend's inspection result field.">
        {!can('iqc:read') ? <EmptyState title="IQC access not granted" description="Your current role cannot read inspection records." /> : loading ? <LoadingState /> : pending ? <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700"><ClipboardCheck className="h-5 w-5" /></span><div><p className="text-2xl font-semibold tabular-nums text-slate-950">{pending.total}</p><p className="text-xs text-slate-500">pending inspection result</p></div></div><Link to="/iqc" className="text-sm font-medium text-sky-800 hover:text-sky-950">View IQC</Link></div> : <EmptyState title="Queue unavailable" />}
        {can('materials:read') && <div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-center gap-2 text-xs font-medium text-slate-600"><PackageCheck className="h-4 w-4" />Internal lots are available in traceability.</div><Link to="/internal-lots" className="mt-2 inline-block text-xs font-semibold text-sky-800">Browse internal lots</Link></div>}
      </Panel>
    </div>
    <p className="mt-5 text-xs text-slate-500">Dashboard statistics are sourced from paginated API list totals. No yield, defect rate or trend is inferred from partial list pages.</p>
  </section>
}

function message(error: unknown) { return error instanceof ApiError ? error.details : 'Could not load this data.' }
