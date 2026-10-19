import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const fetchMock = vi.fn()
const receipt = { id: 21, supplier_id: 4, material_id: 8, supplier_lot_id: 13, receipt_no: 'RCV-TEST-21', received_at: '2026-10-19T12:00:00Z', received_by_user_id: 7, qty_received: '12.0000', qty_remaining: '12.0000', status: 'received', notes: null, created_at: '2026-10-19T12:00:00Z' }
const internalLot = { id: 31, material_id: 8, supplier_lot_id: 13, receipt_id: 21, internal_lot_no: 'LOT-TEST-31', qty_on_hand: '12.0000', qty_reserved: '0.0000', uom: 'kg', lot_status: 'quarantine', expiry_date: null, created_at: '2026-10-19T12:00:00Z' }
const supplier = { id: 4, supplier_code: 'SUP-04', supplier_name: 'Precision Supply', contact_name: null, phone: null, email: null, status: 'active', address: null, country: 'TW', created_at: '', updated_at: '' }
const material = { id: 8, material_code: 'MAT-08', material_name: 'Alloy Sheet', material_type: 'raw', spec: null, uom: 'kg', status: 'active', created_at: '', updated_at: '' }
const supplierLot = { id: 13, supplier_id: 4, material_id: 8, supplier_lot_no: 'SUPLOT-13', manufacturing_date: null, expiry_date: null, qty_received: '100.0000', uom: 'kg', qc_status: 'approved', created_at: '' }

beforeEach(() => {
  fetchMock.mockReset()
  window.localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
})

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) } as Response
}
function page<T>(items: T[], total = items.length) { return { items, total, page: 1, page_size: 100 } }
function installApiMock(withWorkflowData = false) {
  let savedReceipt: typeof receipt | null = null
  let savedLot: typeof internalLot | null = null
  let savedIqc: Record<string, unknown> | null = null
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const jsonBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    if (url.endsWith('/api/v1/auth/login')) return response({ access_token: 'demo-token', token_type: 'bearer' })
    if (url.endsWith('/api/v1/auth/me')) return response({ id: 7, username: 'qa', email: 'qa@example.test', is_active: true, roles: ['quality'], permissions: withWorkflowData ? ['suppliers:read', 'suppliers:write', 'materials:read', 'materials:write', 'receipts:read', 'receipts:write', 'iqc:read', 'iqc:write'] : ['iqc:read', 'iqc:write'] })
    if (url.includes('/api/v1/suppliers')) return response(page(withWorkflowData ? [supplier] : []))
    if (url.includes('/api/v1/materials')) return response(page(withWorkflowData ? [material] : []))
    if (url.includes('/api/v1/supplier-lots')) return response(page(withWorkflowData ? [supplierLot] : []))
    if (url.includes('/api/v1/receipts/21/internal-lots') && method === 'POST') { savedLot = { ...internalLot, internal_lot_no: String(jsonBody.internal_lot_no), qty_on_hand: String(jsonBody.qty) }; return response(savedLot, 201) }
    if (url.endsWith('/api/v1/receipts') && method === 'POST') { savedReceipt = { ...receipt, receipt_no: String(jsonBody.receipt_no), qty_received: String(jsonBody.qty_received), qty_remaining: String(jsonBody.qty_received) }; return response(savedReceipt, 201) }
    if (url.endsWith('/api/v1/receipts/21')) return response(savedReceipt ?? receipt)
    if (url.includes('/api/v1/receipts')) return response(page(savedReceipt ? [savedReceipt] : []))
    if (url.endsWith('/api/v1/internal-lots/31')) return response(savedLot ?? internalLot)
    if (url.includes('/api/v1/internal-lots')) return response(page(savedLot ? [savedLot] : []))
    if (url.endsWith('/api/v1/iqc') && method === 'POST') { savedIqc = { id: 41, receipt_id: null, internal_lot_id: 31, inspector_user_id: 7, sample_qty: String(jsonBody.sample_qty), inspection_result: jsonBody.inspection_result, inspection_date: jsonBody.inspection_date, release_status: jsonBody.release_status, remarks: jsonBody.remarks ?? null, created_at: '' }; return response(savedIqc, 201) }
    if (url.includes('/api/v1/iqc')) return response(page(savedIqc ? [savedIqc] : []))
    if (url.endsWith('/api/v1/auth/logout')) return response({ message: 'Successfully logged out' })
    return response(page([]))
  })
}

async function signIn() {
  await userEvent.type(screen.getByLabelText(/username/i), 'qa')
  await userEvent.type(screen.getByLabelText(/password/i), 'secret')
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('SMTMS application', () => {
  it('redirects unauthenticated users and logs in with a valid token', async () => {
    installApiMock()
    render(<App />)
    expect(screen.getByRole('heading', { name: /sign in to smtms/i })).toBeInTheDocument()
    await signIn()
    expect(window.localStorage.getItem('smtms_token')).toBe('demo-token')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
  })

  it('completes receipt creation, internal lot split, and pending IQC with backend-confirmed statuses', async () => {
    installApiMock(true)
    render(<App />)
    await signIn()
    await screen.findByRole('heading', { name: 'Overview' })
    await userEvent.click(screen.getByRole('link', { name: /material receipt/i }))
    await screen.findByRole('heading', { name: 'Material receipt' })

    await userEvent.selectOptions(await screen.findByLabelText('Supplier'), '4')
    await userEvent.selectOptions(await screen.findByLabelText('Material'), '8')
    await userEvent.selectOptions(await screen.findByLabelText(/Supplier lot/), '13')
    await userEvent.type(screen.getByLabelText('Receipt number'), 'RCV-TEST-21')
    await userEvent.type(screen.getByLabelText('Quantity received'), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Review receipt' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Create receipt' }))
    expect(await screen.findByText(/Receipt RCV-TEST-21 created/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Internal lot number'), 'LOT-TEST-31')
    await userEvent.type(screen.getByLabelText(/Quantity.*available/), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Create lot' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Create internal lot' }))
    expect(await screen.findByText('quarantine')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /iqc inspection/i }))
    await screen.findByRole('heading', { name: 'IQC inspection' })
    await userEvent.selectOptions(await screen.findByLabelText('Internal lot'), '31')
    await userEvent.type(screen.getByLabelText('Sample quantity'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Review inspection' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Save inspection' }))
    expect(await screen.findByText(/recorded as pending \/ hold/i)).toBeInTheDocument()
    expect(await screen.findByText('Backend-confirmed lot disposition')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/iqc'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('"release_status":"hold"') }))
  })
})
