import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Search } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { buttonClass, DataTable, EmptyState, ErrorState, FormField, inputClass, LoadingState, PageHeader, Panel, secondaryButtonClass, StatusBadge, TableBody, TableHead, TableRow, Td, Th } from '../components/ui'
import type { Material, PaginatedResponse, Supplier, UserProfile } from '../types'

export function CatalogPages({ kind, profile }: { kind: 'suppliers' | 'materials'; profile: UserProfile | null }) {
  return kind === 'suppliers' ? <SuppliersPage profile={profile} /> : <MaterialsPage profile={profile} />
}

function SuppliersPage({ profile }: { profile: UserProfile | null }) {
  const [data, setData] = useState<PaginatedResponse<Supplier> | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const canWrite = Boolean(profile?.permissions.includes('suppliers:write'))
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await api.listSuppliers({ keyword: query || undefined, page, page_size: 20 })) } catch (err) { setError(message(err)) } finally { setLoading(false) } }, [query, page])
  useEffect(() => { const timer = window.setTimeout(() => { void load() }, query ? 250 : 0); return () => window.clearTimeout(timer) }, [load, query])
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSuccess('')
    const form = new FormData(event.currentTarget)
    try { await api.createSupplier({ supplier_code: String(form.get('supplier_code')).trim(), supplier_name: String(form.get('supplier_name')).trim(), contact_name: optional(form.get('contact_name')), email: optional(form.get('email')), phone: optional(form.get('phone')), country: optional(form.get('country')), status: 'active' }); setSuccess('Supplier created.'); setShowForm(false); setPage(1); await load() }
    catch (err) { setError(message(err)) }
  }
  return <section><PageHeader eyebrow="Master data" title="Suppliers" description="Supplier directory and qualification status from the live supplier catalog." action={canWrite && <button className={buttonClass} onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />{showForm ? 'Close' : 'New supplier'}</button>} />
    {showForm && <Panel title="Register supplier" className="mb-5"><form onSubmit={create} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><FormField label="Supplier code"><input name="supplier_code" className={inputClass} required maxLength={80} /></FormField><FormField label="Supplier name"><input name="supplier_name" className={inputClass} required maxLength={200} /></FormField><FormField label="Contact name"><input name="contact_name" className={inputClass} maxLength={120} /></FormField><FormField label="Email"><input name="email" type="email" className={inputClass} maxLength={160} /></FormField><FormField label="Phone"><input name="phone" className={inputClass} maxLength={40} /></FormField><FormField label="Country"><input name="country" className={inputClass} maxLength={80} /></FormField><div className="sm:col-span-2 xl:col-span-3"><button className={buttonClass}>Create supplier</button></div></form></Panel>}
    {success && <p role="status" className="mb-4 text-sm text-emerald-800">{success}</p>}{error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
    <Panel title="Supplier directory" description={`${data?.total ?? '—'} supplier records · search supported by the API`} action={<span className="text-xs text-slate-500">Page size 20</span>}><div className="mb-4 flex gap-2"><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Supplier search" className={`${inputClass} pl-9`} placeholder="Search code or supplier name" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div></div>
      {loading ? <LoadingState label="Loading supplier records…" /> : data?.items.length ? <DataTable><TableHead><TableRow><Th>Code</Th><Th>Supplier name</Th><Th>Contact</Th><Th>Country</Th><Th>Status</Th></TableRow></TableHead><TableBody>{data.items.map((supplier) => <TableRow key={supplier.id}><Td className="font-medium text-slate-950">{supplier.supplier_code}</Td><Td>{supplier.supplier_name}</Td><Td>{supplier.contact_name || supplier.email || '—'}</Td><Td>{supplier.country || '—'}</Td><Td><StatusBadge value={supplier.status} /></Td></TableRow>)}</TableBody></DataTable> : <EmptyState title="No suppliers found" description={query ? 'Try a different supplier code or name.' : 'No supplier records are available yet.'} />}
      <Pagination page={page} pageSize={data?.page_size ?? 20} total={data?.total ?? 0} onChange={setPage} />
    </Panel>
  </section>
}

function MaterialsPage({ profile }: { profile: UserProfile | null }) {
  const [data, setData] = useState<PaginatedResponse<Material> | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const canWrite = Boolean(profile?.permissions.includes('materials:write'))
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await api.listMaterials({ keyword: query || undefined, page, page_size: 20 })) } catch (err) { setError(message(err)) } finally { setLoading(false) } }, [query, page])
  useEffect(() => { const timer = window.setTimeout(() => { void load() }, query ? 250 : 0); return () => window.clearTimeout(timer) }, [load, query])
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSuccess('')
    const form = new FormData(event.currentTarget)
    try { await api.createMaterial({ material_code: String(form.get('material_code')).trim(), material_name: String(form.get('material_name')).trim(), material_type: String(form.get('material_type')).trim(), uom: String(form.get('uom')).trim(), spec: optional(form.get('spec')), status: 'active' }); setSuccess('Material created.'); setShowForm(false); setPage(1); await load() }
    catch (err) { setError(message(err)) }
  }
  return <section><PageHeader eyebrow="Master data" title="Materials" description="Controlled materials catalog used by receiving, inventory and inspection workflows." action={canWrite && <button className={buttonClass} onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />{showForm ? 'Close' : 'New material'}</button>} />
    {showForm && <Panel title="Register material" className="mb-5"><form onSubmit={create} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><FormField label="Material code"><input name="material_code" className={inputClass} required maxLength={80} /></FormField><FormField label="Material name"><input name="material_name" className={inputClass} required maxLength={200} /></FormField><FormField label="Material type"><input name="material_type" className={inputClass} required maxLength={50} /></FormField><FormField label="Unit of measure"><input name="uom" className={inputClass} required maxLength={30} /></FormField><FormField label="Specification"><input name="spec" className={inputClass} maxLength={255} /></FormField><div className="flex items-end"><button className={buttonClass}>Create material</button></div></form></Panel>}
    {success && <p role="status" className="mb-4 text-sm text-emerald-800">{success}</p>}{error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
    <Panel title="Material catalog" description={`${data?.total ?? '—'} material records · search supported by the API`}><div className="mb-4 flex gap-2"><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Material search" className={`${inputClass} pl-9`} placeholder="Search material code or name" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div></div>
      {loading ? <LoadingState label="Loading material records…" /> : data?.items.length ? <DataTable><TableHead><TableRow><Th>Code</Th><Th>Material name</Th><Th>Type</Th><Th>Specification</Th><Th>UOM</Th><Th>Status</Th></TableRow></TableHead><TableBody>{data.items.map((material) => <TableRow key={material.id}><Td className="font-medium text-slate-950">{material.material_code}</Td><Td>{material.material_name}</Td><Td>{material.material_type}</Td><Td>{material.spec || '—'}</Td><Td>{material.uom}</Td><Td><StatusBadge value={material.status} /></Td></TableRow>)}</TableBody></DataTable> : <EmptyState title="No materials found" description={query ? 'Try a different material code or name.' : 'No material records are available yet.'} />}
      <Pagination page={page} pageSize={data?.page_size ?? 20} total={data?.total ?? 0} onChange={setPage} />
    </Panel>
  </section>
}

function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 records'}</span><div className="flex gap-2"><button className={secondaryButtonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><button className={secondaryButtonClass} disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div></div>
}
function optional(value: FormDataEntryValue | null) { const result = String(value ?? '').trim(); return result || undefined }
function message(error: unknown) { return error instanceof ApiError ? error.details : 'Request failed. Check your connection and try again.' }
