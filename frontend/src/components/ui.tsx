import 'antd/dist/reset.css'
import { Alert, Button, Card, Empty, Flex, Modal, Spin, Statistic, Tag, Typography } from 'antd'
import { useState, type ReactNode } from 'react'
import { statusLabel, severityLabel } from '../lib/status'

const { Title, Text } = Typography

type PageHeaderProps = { eyebrow: string; title: string; description?: string; action?: ReactNode }
export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <Flex align="flex-start" justify="space-between" wrap="wrap" gap={12} style={{ width: '100%', marginBottom: 28, borderBottom: '1px solid #f0f0f0', paddingBottom: 16 }}>
      <Flex vertical gap={2} style={{ minWidth: 0 }}>
        {eyebrow ? <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em' }}>{eyebrow}</Text> : null}
        <Title level={2} style={{ margin: 0 }}>{title}</Title>
        {description ? <Text type="secondary" style={{ marginTop: 4 }}>{description}</Text> : null}
      </Flex>
      {action ?? null}
    </Flex>
  )
}

export function Panel({ title, description, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card
      title={
        title || description ? (
          <Flex vertical gap={2}>
            {title ? <Title level={5} style={{ margin: 0 }}>{title}</Title> : null}
            {description ? <Text type="secondary">{description}</Text> : null}
          </Flex>
        ) : undefined
      }
      extra={action}
      className={className}
      styles={{ body: { paddingTop: title || description ? undefined : 24 } }}
    >
      {children}
    </Card>
  )
}

// 保留 children 組合介面以維持既有頁面相容性；不強制轉為 AntD Table。
export function DataTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`ant-table-wrapper ${className}`.trim()} style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', textAlign: 'left', fontSize: 14, background: '#fff' }}>{children}</table>
    </div>
  )
}

export function TableHead({ children }: { children: ReactNode }) { return <thead style={{ backgroundColor: '#fafafa', color: 'rgba(0,0,0,0.88)', fontSize: 13, fontWeight: 600 }}>{children}</thead> }
export function TableBody({ children }: { children: ReactNode }) { return <tbody>{children}</tbody> }
export function TableRow({ children, ...props }: { children: ReactNode; className?: string; onClick?: () => void }) { return <tr {...props} style={{ borderBottom: '1px solid #f0f0f0' }}>{children}</tr> }
export function Th({ children, className = '' }: { children: ReactNode; className?: string }) { return <th className={className} style={{ whiteSpace: 'nowrap', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>{children}</th> }
export function Td({ children, className = '' }: { children: ReactNode; className?: string }) { return <td className={className} style={{ padding: '12px 16px', verticalAlign: 'middle' }}>{children}</td> }

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const normalized = value.toLowerCase()
  const tone = ['active', 'available', 'passed', 'released', 'approved', 'complete', 'completed', 'closed'].includes(normalized)
    ? 'success'
    : ['pending', 'hold', 'quarantine', 'received', 'in_progress', 'pending_confirmation'].includes(normalized)
      ? 'warning'
      : ['failed', 'rejected', 'inactive', 'blocked', 'returned'].includes(normalized)
        ? 'error'
        : normalized === 'investigating'
          ? 'processing'
          : 'default'
  return <Tag color={tone}>{label ?? statusLabel(value)}</Tag>
}

export function SeverityBadge({ value, label }: { value: string; label?: string }) {
  const normalized = value.toLowerCase()
  const tone = normalized === 'critical' ? 'red'
    : normalized === 'high' ? 'orange'
    : normalized === 'medium' ? 'gold'
    : normalized === 'low' ? 'green'
    : 'default'
  return <Tag color={tone}>{label ?? severityLabel(value)}</Tag>
}

// 保留 children 既有使用方式（label + 原生/自訂輸入），以 AntD 文字元件呈現狀態。
export function FormField({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <Flex vertical gap={4} style={{ minWidth: 0 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', minWidth: 0 }}>
        <Text strong style={{ display: 'block', marginBottom: 4 }}>{label}</Text>
        {children}
      </label>
      {hint && !error ? <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text> : null}
      {error ? <Text type="danger" style={{ fontSize: 12 }}>{error}</Text> : null}
    </Flex>
  )
}

// 相容性保留：多處既有頁面以 className 使用；不改為 React Component，避免跨檔破壞。
// 使用 ! 強制優先級，避免被 antd/dist/reset.css 覆蓋文字顏色
export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15 disabled:cursor-not-allowed disabled:bg-slate-50'

export const buttonClass =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium !text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

export const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium !text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

export function LoadingState({ label = '資料載入中…' }: { label?: string }) {
  return <Flex role="status" align="center" gap={8} style={{ padding: '32px 0' }}><Spin size="small" /><Text>{label}</Text></Flex>
}
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <Empty description={<Flex vertical gap={4} align="center"><Text strong>{title}</Text>{description ? <Text type="secondary">{description}</Text> : null}</Flex>} />
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Alert type="error" showIcon title={message} action={onRetry ? <Button onClick={onRetry} size="small">重試</Button> : null} />
}
export function SuccessMessage({ children }: { children: ReactNode }) { return <Alert type="success" showIcon title={children} /> }

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
  return (
    <>
      <span onClick={() => { if (!pending) setOpen(true) }} style={{ cursor: 'pointer', display: 'inline-block' }}>{trigger}</span>
      <Modal
        open={open}
        onCancel={() => { if (!pending) { setOpen(false); setFailure('') } }}
        title={title}
        closable={!pending}
        maskClosable={!pending}
        keyboard={!pending}
        footer={[
          <Button key="cancel" onClick={() => { if (!pending) { setOpen(false); setFailure('') } }} disabled={pending}>
            取消
          </Button>,
          <Button key="confirm" type="primary" danger={destructive} onClick={() => void confirm()} disabled={pending} loading={pending}>
            {pending ? '處理中…' : confirmLabel}
          </Button>,
        ]}
      >
        <Flex vertical gap={16}>
          <Text>{description}</Text>
          {failure ? <Alert type="error" title={failure} showIcon /> : null}
        </Flex>
      </Modal>
    </>
  )
}

export function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <Card size="small"><Statistic title={label} value={value} /><Text type="secondary" style={{ fontSize: 12 }}>{detail}</Text></Card>
}