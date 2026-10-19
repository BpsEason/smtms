import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '../api/client'
import { allInternalLots, allMaterials, allSupplierLots, allSuppliers, getErrorMessage, localDateTimeNow } from '../lib/data'
import { buttonClass, ConfirmDialog, DataTable, EmptyState, ErrorState, FormField, inputClass, LoadingState, PageHeader, Panel, secondaryButtonClass, StatusBadge, SuccessMessage, TableBody, TableHead, TableRow, Td, Th } from '../components/ui'
import type { InternalLot, IQCRecord, Material, PaginatedResponse, Receipt, Supplier, SupplierLot, UserProfile } from '../types'

export function ReceiptsPage({ profile }: { profile: UserProfile | null }) {
  const [receipts, setReceipts] = useState<PaginatedResponse<Receipt> | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [supplierLots, setSupplierLots] = useState<SupplierLot[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null)
  const [selectedLot, setSelectedLot] = useState<InternalLot | null>(null)
  const [loading, setLoading] = useState(true)
  const [resourceLoading, setResourceLoading] = useState(true)
  const [resourceError, setResourceError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [splitError, setSplitError] = useState('')
  const [receiptForm, setReceiptForm] = useState({ supplierId: '', materialId: '', supplierLotId: '', receiptNo: '', quantity: '', receivedAt: localDateTimeNow(), notes: '' })
  const [splitForm, setSplitForm] = useState({ lotNo: '', quantity: '' })
  const receiptFormRef = useRef<HTMLFormElement>(null)
  const splitFormRef = useRef<HTMLFormElement>(null)
  const canWrite = Boolean(profile?.permissions.includes('receipts:write'))
  const eligibleLots = useMemo(() => supplierLots.filter((lot) => String(lot.supplier_id) === receiptForm.supplierId && String(lot.material_id) === receiptForm.materialId), [supplierLots, receiptForm.supplierId, receiptForm.materialId])

  const loadReceipts = useCallback(async () => {
    try { const response = await api.listReceipts({ page: 1, page_size: 50 }); setReceipts(response); setSelectedId((current) => current ?? response.items[0]?.id ?? null) }
    catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => { void loadReceipts() }, 0); return () => window.clearTimeout(timer) }, [loadReceipts])
  useEffect(() => {
    let active = true
    Promise.all([allSuppliers(), allMaterials(), allSupplierLots()]).then(([supplierItems, materialItems, lotItems]) => {
      if (active) { setSuppliers(supplierItems); setMaterials(materialItems); setSupplierLots(lotItems) }
    }).catch((err: unknown) => { if (active) setResourceError(`Reference data unavailable: ${getErrorMessage(err)}. Supplier lot selection requires suppliers:read access and existing supplier lots.`) }).finally(() => { if (active) setResourceLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (selectedId === null) return
    let active = true
    api.getReceipt(selectedId).then((receipt) => { if (active) setSelectedReceipt(receipt) }).catch((err) => { if (active) setError(getErrorMessage(err)) })
    return () => { active = false }
  }, [selectedId])

  const createReceipt = async () => {
    setError(''); setSuccess('')
    if (!receiptFormRef.current?.reportValidity()) return
    try {
      const created = await api.createReceipt({ supplier_id: Number(receiptForm.supplierId), material_id: Number(receiptForm.materialId), supplier_lot_id: Number(receiptForm.supplierLotId), receipt_no: receiptForm.receiptNo.trim(), qty_received: receiptForm.quantity, received_at: new Date(receiptForm.receivedAt).toISOString(), notes: receiptForm.notes.trim() || undefined })
      setSuccess(`Receipt ${created.receipt_no} created with status “${created.status}”.`); setSelectedId(created.id)
      setReceiptForm({ supplierId: '', materialId: '', supplierLotId: '', receiptNo: '', quantity: '', receivedAt: localDateTimeNow(), notes: '' })
      await loadReceipts()
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const splitReceipt = async () => {
    setSplitError(''); setSuccess('')
    if (!selectedReceipt || !splitFormRef.current?.reportValidity()) return
    if (Number(splitForm.quantity) > Number(selectedReceipt.qty_remaining)) { setSplitError('Split quantity cannot exceed the receipt quantity remaining.'); return }
    try {
      const created = await api.splitReceipt(selectedReceipt.id, { internal_lot_no: splitForm.lotNo.trim(), qty: splitForm.quantity })
      setSelectedLot(created)
      setSuccess(`Internal lot ${created.internal_lot_no} created. Backend status: ${created.lot_status}.`)
      setSplitForm({ lotNo: '', quantity: '' })
      await loadReceipts()
      const current = await api.getReceipt(selectedReceipt.id); setSelectedReceipt(current)
    } catch (err) { setSplitError(getErrorMessage(err)) }
  }

  return <section>
    <PageHeader eyebrow="Inbound quality" title="Material receipt" description="Register received quantities against existing supplier lots, then split receipts into traceable internal lots." />
    {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void loadReceipts()} /></div>}{success && <div className="mb-4"><SuccessMessage>{success}</SuccessMessage></div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
      {canWrite && <Panel title="Register receipt" description="Reference options are loaded from supplier, material and supplier-lot APIs.">
        {resourceLoading ? <LoadingState label="Loading supplier and material choices…" /> : <form ref={receiptFormRef} onSubmit={(event) => event.preventDefault()} className="space-y-4">
          {resourceError && <ErrorState message={resourceError} />}
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Supplier"><select className={inputClass} required value={receiptForm.supplierId} onChange={(event) => setReceiptForm((old) => ({ ...old, supplierId: event.target.value, supplierLotId: '' }))}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_code} · {supplier.supplier_name}</option>)}</select></FormField>
          <FormField label="Material"><select className={inputClass} required value={receiptForm.materialId} onChange={(event) => setReceiptForm((old) => ({ ...old, materialId: event.target.value, supplierLotId: '' }))}><option value="">Select material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.material_code} · {material.material_name}</option>)}</select></FormField></div>
          <FormField label="Supplier lot" hint="Only lots matching the selected supplier and material are listed."><select className={inputClass} required disabled={!receiptForm.supplierId || !receiptForm.materialId} value={receiptForm.supplierLotId} onChange={(event) => setReceiptForm((old) => ({ ...old, supplierLotId: event.target.value }))}><option value="">Select supplier lot</option>{eligibleLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.supplier_lot_no} · {lot.qty_received} {lot.uom} · {lot.qc_status}</option>)}</select>{!resourceError && receiptForm.supplierId && receiptForm.materialId && eligibleLots.length === 0 && <span className="block text-xs font-normal text-amber-800">No existing supplier lot matches this combination. Supplier-lot creation is not available in the current API.</span>}</FormField>
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Receipt number"><input className={inputClass} required maxLength={80} value={receiptForm.receiptNo} onChange={(event) => setReceiptForm((old) => ({ ...old, receiptNo: event.target.value }))} /></FormField><FormField label="Quantity received"><input className={inputClass} type="number" min="0.0001" step="any" required value={receiptForm.quantity} onChange={(event) => setReceiptForm((old) => ({ ...old, quantity: event.target.value }))} /></FormField><FormField label="Received at"><input className={inputClass} type="datetime-local" required value={receiptForm.receivedAt} onChange={(event) => setReceiptForm((old) => ({ ...old, receivedAt: event.target.value }))} /></FormField><FormField label="Notes"><input className={inputClass} maxLength={500} value={receiptForm.notes} onChange={(event) => setReceiptForm((old) => ({ ...old, notes: event.target.value }))} /></FormField></div>
          <ConfirmDialog trigger={<button type="button" className={buttonClass} disabled={!suppliers.length || !materials.length || !eligibleLots.length || resourceLoading} onClick={(event) => { if (!receiptFormRef.current?.reportValidity()) event.preventDefault() }}>Review receipt</button>} title="Create this receipt?" description="This will register the inbound quantity against the selected supplier lot. The backend will validate supplier/material association and receipt number." confirmLabel="Create receipt" onConfirm={createReceipt} />
        </form>}
      </Panel>}
      <Panel title="Receipt register" description="Showing the first 50 receipts returned by the API." className={!canWrite ? 'xl:col-span-2' : ''} action={<button className={secondaryButtonClass} onClick={() => { setLoading(true); setError(''); void loadReceipts() }}><RefreshCw className="h-4 w-4" />Refresh</button>}>
        {loading ? <LoadingState label="Loading receipts…" /> : receipts?.items.length ? <div className="space-y-2">{receipts.items.map((receipt) => <button key={receipt.id} onClick={() => { setSelectedId(receipt.id); setSelectedLot(null); setSuccess('') }} className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left ${selectedId === receipt.id ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 hover:bg-slate-50'}`}><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{receipt.receipt_no}</span><span className="mt-1 block text-xs text-slate-500">Supplier #{receipt.supplier_id} · Material #{receipt.material_id} · {new Date(receipt.received_at).toLocaleDateString()}</span></span><span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge value={receipt.status} /><span className="text-xs tabular-nums text-slate-500">{receipt.qty_remaining} remaining</span></span></button>)}</div> : <EmptyState title="No receipts available" description="Create a receipt using a supplier lot that already exists in the catalog." />}
      </Panel>
    </div>
    {selectedReceipt && <Panel title="Selected receipt" description="Receipt details are returned by the receipt detail endpoint." className="mt-5">
      <div className="grid gap-4 border-b border-slate-100 pb-5 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Receipt no." value={selectedReceipt.receipt_no} /><Detail label="Supplier / material IDs" value={`${selectedReceipt.supplier_id} / ${selectedReceipt.material_id}`} /><Detail label="Received" value={`${selectedReceipt.qty_received} · ${selectedReceipt.status}`} /><Detail label="Remaining" value={selectedReceipt.qty_remaining} /></div>
      {canWrite && <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div><h3 className="text-sm font-semibold text-slate-900">Split into internal lot</h3><p className="mt-1 text-xs text-slate-500">Created lots enter quarantine; the returned status is shown after the API confirms.</p></div><form ref={splitFormRef} onSubmit={(event) => event.preventDefault()} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]"><FormField label="Internal lot number"><input className={inputClass} required maxLength={120} value={splitForm.lotNo} onChange={(event) => setSplitForm((old) => ({ ...old, lotNo: event.target.value }))} /></FormField><FormField label="Quantity" hint={`${selectedReceipt.qty_remaining} available`}><input className={inputClass} type="number" min="0.0001" max={selectedReceipt.qty_remaining} step="any" required value={splitForm.quantity} onChange={(event) => setSplitForm((old) => ({ ...old, quantity: event.target.value }))} /></FormField><div className="flex items-end"><ConfirmDialog trigger={<button type="button" className={buttonClass} disabled={Number(selectedReceipt.qty_remaining) <= 0} onClick={(event) => { if (!splitFormRef.current?.reportValidity()) event.preventDefault() }}>Create lot</button>} title="Split receipt quantity?" description={`Create internal lot ${splitForm.lotNo || '(unnamed)'} for ${splitForm.quantity || '0'} units. This reduces the receipt’s remaining quantity and starts the lot in quarantine.`} confirmLabel="Create internal lot" onConfirm={splitReceipt} /></div>{splitError && <div className="sm:col-span-3"><ErrorState message={splitError} /></div>}</form></div>}
      {selectedLot && <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">Latest lot created: {selectedLot.internal_lot_no}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-900"><span>Lot ID: {selectedLot.id}</span><span>Quantity: {selectedLot.qty_on_hand} {selectedLot.uom}</span><span>Backend status: <StatusBadge value={selectedLot.lot_status} /></span></div><p className="mt-2 text-xs text-emerald-800">Create an IQC inspection for this lot from the IQC page.</p></div>}
    </Panel>}
  </section>
}

export function InternalLotsPage() {
  const [data, setData] = useState<PaginatedResponse<InternalLot> | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setError(''); try { setData(await api.listInternalLots({ keyword: query || undefined, page, page_size: 20 })) } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) } }, [query, page])
  useEffect(() => { const timer = window.setTimeout(() => void load(), query ? 250 : 0); return () => window.clearTimeout(timer) }, [load, query])
  return <section><PageHeader eyebrow="Traceability" title="Internal lots" description="Inventory lot identity, source references and current backend-controlled disposition." />{error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
    <Panel title="Internal lot register" description={`${data?.total ?? '—'} lots · searchable by lot number or material name`}><div className="mb-4 max-w-sm"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} aria-label="Internal lot search" placeholder="Search lot number or material" value={query} onChange={(event) => { setLoading(true); setQuery(event.target.value); setPage(1) }} /></div></div>
      {loading ? <LoadingState label="Loading internal lots…" /> : data?.items.length ? <DataTable><TableHead><TableRow><Th>Internal lot</Th><Th>Material ID</Th><Th>Receipt ID</Th><Th>On hand</Th><Th>Reserved</Th><Th>Expiry</Th><Th>Status</Th></TableRow></TableHead><TableBody>{data.items.map((lot) => <TableRow key={lot.id}><Td className="font-medium text-slate-950">{lot.internal_lot_no}</Td><Td>{lot.material_id}</Td><Td>{lot.receipt_id ?? '—'}</Td><Td>{lot.qty_on_hand} {lot.uom}</Td><Td>{lot.qty_reserved}</Td><Td>{lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString() : '—'}</Td><Td><StatusBadge value={lot.lot_status} /></Td></TableRow>)}</TableBody></DataTable> : <EmptyState title="No internal lots found" description="Lots appear when a receipt quantity is split into an internal lot." />}
      <Pagination page={page} total={data?.total ?? 0} pageSize={data?.page_size ?? 20} onChange={(nextPage) => { setLoading(true); setPage(nextPage) }} />
    </Panel></section>
}

export function IQCPage({ profile }: { profile: UserProfile | null }) {
  const [records, setRecords] = useState<PaginatedResponse<IQCRecord> | null>(null)
  const [lots, setLots] = useState<InternalLot[]>([])
  const [loading, setLoading] = useState(true)
  const [lotsLoading, setLotsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lotError, setLotError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ lotId: '', sampleQty: '', result: 'pending' as 'pending' | 'passed' | 'failed', inspectionDate: localDateTimeNow(), remarks: '' })
  const [updatedLot, setUpdatedLot] = useState<InternalLot | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const canWrite = Boolean(profile?.permissions.includes('iqc:write'))
  const outcomeStatus = form.result === 'passed' ? 'released' : form.result === 'failed' ? 'rejected' : 'hold'
  const selectedLot = lots.find((lot) => String(lot.id) === form.lotId)

  const loadRecords = useCallback(async () => { try { setRecords(await api.listIQCRecords({ page: 1, page_size: 50 })); setError('') } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) } }, [])
  useEffect(() => { const timer = window.setTimeout(() => { void loadRecords() }, 0); return () => window.clearTimeout(timer) }, [loadRecords])
  useEffect(() => { let active = true; allInternalLots().then((items) => { if (active) setLots(items) }).catch((err) => { if (active) setLotError(getErrorMessage(err)) }).finally(() => { if (active) setLotsLoading(false) }); return () => { active = false } }, [])

  const createInspection = async () => {
    setError(''); setSuccess('')
    if (!formRef.current?.reportValidity() || !selectedLot) return
    try {
      const created = await api.createIQC({ internal_lot_id: selectedLot.id, sample_qty: form.sampleQty, inspection_result: form.result, inspection_date: new Date(form.inspectionDate).toISOString(), release_status: outcomeStatus, remarks: form.remarks.trim() || undefined })
      setSuccess(`Inspection ${created.id} recorded as ${created.inspection_result} / ${created.release_status}.`)
      setForm({ lotId: '', sampleQty: '', result: 'pending', inspectionDate: localDateTimeNow(), remarks: '' })
      await loadRecords()
      if (created.internal_lot_id !== null) {
        try { const actualLot = await api.getInternalLot(created.internal_lot_id); setUpdatedLot(actualLot); setLots((current) => current.map((lot) => lot.id === actualLot.id ? actualLot : lot)) }
        catch (err) { setError(`Inspection was saved, but refreshed lot status could not be read: ${getErrorMessage(err)}`) }
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  return <section><PageHeader eyebrow="Incoming quality control" title="IQC inspection" description="Record inspection outcomes against an existing internal lot. Lot disposition is set by the backend from the validated result/release pair." />
    {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void loadRecords()} /></div>}{success && <div className="mb-4"><SuccessMessage>{success}</SuccessMessage></div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
      {canWrite && <Panel title="Record inspection" description="Pending / hold, passed / released, failed / rejected are paired to match backend validation.">
        {lotsLoading ? <LoadingState label="Loading internal lots…" /> : lotError ? <ErrorState message={`Cannot load inspection targets: ${lotError}`} /> : !lots.length ? <EmptyState title="No internal lots available" description="Create an internal lot from a receipt before starting IQC." /> : <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="space-y-4">
          <FormField label="Internal lot" hint={selectedLot ? `Current backend lot status: ${selectedLot.lot_status} · ${selectedLot.qty_on_hand} ${selectedLot.uom} on hand` : undefined}><select className={inputClass} required value={form.lotId} onChange={(event) => { setForm((old) => ({ ...old, lotId: event.target.value })); setUpdatedLot(null) }}><option value="">Select internal lot</option>{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.internal_lot_no} · {lot.lot_status}</option>)}</select></FormField>
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Sample quantity"><input className={inputClass} type="number" min="0.0001" step="any" required value={form.sampleQty} onChange={(event) => setForm((old) => ({ ...old, sampleQty: event.target.value }))} /></FormField><FormField label="Inspection result"><select className={inputClass} value={form.result} onChange={(event) => setForm((old) => ({ ...old, result: event.target.value as typeof old.result }))}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select></FormField><FormField label="Inspection date"><input className={inputClass} type="datetime-local" required value={form.inspectionDate} onChange={(event) => setForm((old) => ({ ...old, inspectionDate: event.target.value }))} /></FormField><div className="space-y-1.5 text-sm font-medium text-slate-700"><span>Release status</span><div className="flex h-[38px] items-center"><StatusBadge value={outcomeStatus} /></div><p className="text-xs font-normal text-slate-500">Set from inspection result per API rules.</p></div></div>
          <FormField label="Remarks"><textarea className={`${inputClass} min-h-20 resize-y`} maxLength={500} value={form.remarks} onChange={(event) => setForm((old) => ({ ...old, remarks: event.target.value }))} /></FormField>
          <ConfirmDialog trigger={<button type="button" className={buttonClass} disabled={!selectedLot} onClick={(event) => { if (!formRef.current?.reportValidity()) event.preventDefault() }}>Review inspection</button>} title="Save inspection result?" description={selectedLot ? `Record ${form.result} for lot ${selectedLot.internal_lot_no}. The backend will set lot disposition according to its validated rules (${form.result} → ${outcomeStatus}).` : 'Select a lot first.'} confirmLabel="Save inspection" onConfirm={createInspection} />
        </form>}
        {updatedLot && <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm"><p className="font-medium text-sky-950">Backend-confirmed lot disposition</p><div className="mt-2 flex flex-wrap items-center gap-3 text-sky-900"><span>{updatedLot.internal_lot_no}</span><StatusBadge value={updatedLot.lot_status} /></div></div>}
      </Panel>}
      <Panel title="Inspection register" description="Latest 50 IQC records. No release shortcut is offered; changes require a validated inspection update.">
        {loading ? <LoadingState label="Loading inspection records…" /> : records?.items.length ? <DataTable><TableHead><TableRow><Th>Record</Th><Th>Target</Th><Th>Sample qty</Th><Th>Inspected</Th><Th>Result</Th><Th>Disposition</Th></TableRow></TableHead><TableBody>{records.items.map((record) => <TableRow key={record.id}><Td className="font-medium text-slate-950">IQC-{record.id}</Td><Td>{record.internal_lot_id ? `Internal lot #${record.internal_lot_id}` : record.receipt_id ? `Receipt #${record.receipt_id}` : '—'}</Td><Td>{record.sample_qty}</Td><Td>{record.inspection_date ? new Date(record.inspection_date).toLocaleDateString() : '—'}</Td><Td><StatusBadge value={record.inspection_result} /></Td><Td><StatusBadge value={record.release_status} /></Td></TableRow>)}</TableBody></DataTable> : <EmptyState title="No IQC records" description="Inspection results appear here after they are registered." />}
      </Panel>
    </div>
  </section>
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value}</p></div> }
function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (value: number) => void }) { const pages = Math.max(1, Math.ceil(total / pageSize)); return <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 records'}</span><div className="flex gap-2"><button className={secondaryButtonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><button className={secondaryButtonClass} disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div></div> }
