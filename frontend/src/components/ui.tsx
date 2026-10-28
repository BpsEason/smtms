import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Check, LoaderCircle, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { statusLabel } from '../lib/status'
import { Button } from './shadcn/button'

type PageHeaderProps = { eyebrow: string; title: string; description?: string; action?: ReactNode }
export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}</div>{action}</header>
}

export function Panel({ title, description, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white ${className}`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">{(title || description) ? <div>{title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div> : <span />}{action}</div><div className="p-5">{children}</div></section>
}

export function DataTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-x-auto rounded-lg border border-slate-200 bg-white ${className}`}><table className="w-full min-w-[620px] border-collapse text-left text-sm">{children}</table></div>
}

export function TableHead({ children }: { children: ReactNode }) { return <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</thead> }
export function TableBody({ children }: { children: ReactNode }) { return <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody> }
export function TableRow({ children, ...props }: { children: ReactNode; className?: string; onClick?: () => void }) { return <tr {...props} className={`hover:bg-slate-50/70 ${props.className ?? ''}`}>{children}</tr> }
export function Th({ children, className = '' }: { children: ReactNode; className?: string }) { return <th className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</th> }
export function Td({ children, className = '' }: { children: ReactNode; className?: string }) { return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td> }

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const normalized = value.toLowerCase()
  const tone = ['active', 'available', 'passed', 'released', 'approved', 'complete', 'completed'].includes(normalized)
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
    : ['pending', 'hold', 'quarantine', 'received', 'in_progress'].includes(normalized)
      ? 'bg-amber-50 text-amber-800 ring-amber-600/20'
      : ['failed', 'rejected', 'inactive', 'blocked', 'returned'].includes(normalized)
        ? 'bg-rose-50 text-rose-700 ring-rose-600/15'
        : 'bg-slate-100 text-slate-700 ring-slate-600/10'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}>{label ?? statusLabel(value)}</span>
}

export function FormField({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor?: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block min-w-0 space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}{hint && !error && <span className="block text-xs font-normal text-slate-500">{hint}</span>}{error && <span className="block text-xs font-normal text-rose-700">{error}</span>}</label>
}

export const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15 disabled:cursor-not-allowed disabled:bg-slate-50'
export const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
export const secondaryButtonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

export function LoadingState({ label = '資料載入中…' }: { label?: string }) { return <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{label}</div> }
export function EmptyState({ title, description }: { title: string; description?: string }) { return <div className="py-10 text-center"><p className="text-sm font-medium text-slate-700">{title}</p>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div> }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{message}</span>{onRetry && <button className="font-semibold underline underline-offset-2" onClick={onRetry}>重試</button>}</div> }
export function SuccessMessage({ children }: { children: ReactNode }) { return <p role="status" className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Check className="h-4 w-4" />{children}</p> }

export function ConfirmDialog({ trigger, title, description, confirmLabel = '確認', onConfirm, destructive = false }: { trigger: ReactNode; title: string; description: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; destructive?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const confirm = async () => {
    setPending(true)
    setFailure('')
    try {
      await onConfirm()
      setOpen(false)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '操作失敗，請稍後再試。')
    } finally {
      setPending(false)
    }
  }
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); if (!value) setFailure('') } }}><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl focus:outline-none"><div className="flex items-start justify-between gap-4"><div><Dialog.Title className="text-base font-semibold text-slate-950">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-slate-600">{description}</Dialog.Description></div><button type="button" aria-label="關閉" disabled={pending} onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>{failure && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{failure}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>取消</Button><Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} onClick={() => void confirm()}>{pending && <LoaderCircle className="h-4 w-4 animate-spin" />}{pending ? '處理中…' : confirmLabel}</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
}

export function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="border-l-2 border-slate-300 pl-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div> }