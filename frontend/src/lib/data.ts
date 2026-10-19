import { api } from '../api/client'
import type { PaginatedResponse } from '../types'

export async function loadAllPages<T>(list: (params: Record<string, string | number | undefined | null>) => Promise<PaginatedResponse<T>>): Promise<T[]> {
  const pageSize = 100
  const first = await list({ page: 1, page_size: pageSize })
  const items = [...first.items]
  const pages = Math.ceil(first.total / pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const next = await list({ page, page_size: pageSize })
    items.push(...next.items)
  }
  return items
}

export function localDateTimeNow() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? `操作失敗：${error.message}` : '請求失敗，請稍後再試。'
}

export const allSuppliers = () => loadAllPages(api.listSuppliers)
export const allMaterials = () => loadAllPages(api.listMaterials)
export const allSupplierLots = () => loadAllPages(api.listSupplierLots)
export const allInternalLots = () => loadAllPages(api.listInternalLots)
