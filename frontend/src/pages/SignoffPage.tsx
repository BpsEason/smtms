import { useEffect, useRef, useState } from 'react'
import { ClipboardSignature, RefreshCw } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { formatErrorMessage } from '../lib/error'
import { getErrorMessage } from '../lib/data'
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  buttonClass,
  secondaryButtonClass,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  SuccessMessage,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from '../components/ui'
import { statusLabel } from '../lib/status'
import type { IQCRecord, PaginatedResponse, QualityReview, UserProfile } from '../types'

function reviewLabel(value: string) {
  return value === 'pending' ? '待簽核' : statusLabel(value)
}

export function SignoffPage({ profile }: { profile: UserProfile | null }) {
  const [reviewFilter, setReviewFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedIdRef = useRef<number | null>(null)
  const [decision, setDecision] = useState({ note: '', reason: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canApprove = Boolean(profile?.permissions.some((permission) => ['quality:review', 'quality:approve'].includes(permission)))
  const canReturn = Boolean(profile?.permissions.some((permission) => ['quality:review', 'quality:return'].includes(permission)))

  const recordsQuery = useQuery<PaginatedResponse<IQCRecord>>({
    queryKey: ['iqc-records', reviewFilter, page],
    queryFn: async () => api.listIQCRecords({ review_status: reviewFilter || undefined, page, page_size: 20 }),
    retry: 1,
    staleTime: 30 * 1000,
  })

  const historyQuery = useQuery<PaginatedResponse<QualityReview>>({
    queryKey: ['quality-reviews', selectedId],
    queryFn: async () => api.listQualityReviews(selectedId!),
    enabled: !!selectedId,
    retry: 1,
    staleTime: 30 * 1000,
  })

  const records = recordsQuery.data
  const history = historyQuery.data?.items ?? null

  const approveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { decision_note?: string; reason?: string } }) =>
      api.approveQualityReview(id, payload),
  })

  const returnMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { decision_note?: string; reason?: string } }) =>
      api.returnQualityReview(id, payload),
  })

  useEffect(() => {
    if (recordsQuery.isLoading) return
    if (!records?.items.length) {
      setSelectedId(null)
      return
    }
    const current = selectedIdRef.current
    const next = current !== null && records.items.some((item) => item.id === current)
      ? current
      : records.items[0].id
    selectedIdRef.current = next
    if (next !== current) {
      setSelectedId(next)
    }
  }, [records, recordsQuery.isLoading])

  const selectedRecord = records?.items.find((item) => item.id === selectedId) ?? null

  const submit = async (kind: 'approve' | 'return') => {
    if (!selectedRecord) return
    setError('')
    setSuccess('')
    const payload = { decision_note: decision.note.trim() || undefined, reason: kind === 'return' ? decision.reason.trim() || undefined : undefined }
    if (kind === 'return' && !payload.reason) { setError('退回時必須填寫退回理由。'); return }
    try {
      if (kind === 'approve') await approveMutation.mutateAsync({ id: selectedRecord.id, payload })
      else await returnMutation.mutateAsync({ id: selectedRecord.id, payload })
      setSuccess(kind === 'approve' ? `IQC-${selectedRecord.id} 已核准，簽核歷程已保存。` : `IQC-${selectedRecord.id} 已退回，簽核歷程已保存。`)
      setDecision({ note: '', reason: '' })
      const resultFilter = kind === 'approve' ? 'approved' : 'returned'
      setReviewFilter(resultFilter)
      setPage(1)
      await historyQuery.refetch()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const totalPages = Math.max(1, Math.ceil((records?.total ?? 0) / (records?.page_size ?? 20)))

  const loading = recordsQuery.isLoading
  const historyLoading = historyQuery.isLoading

  const displayError = error || (recordsQuery.error ? formatErrorMessage(recordsQuery.error) : '')

  return (
    <section>
      <PageHeader
        eyebrow="進料品質管制"
        title="品保簽核"
        description="檢視待簽核的進料檢驗（IQC）紀錄，執行核准或退回。簽核結果由後端驗證並保存完整歷程。"
      />
      {displayError && (
        <div className="mb-4">
          <ErrorState message={displayError} onRetry={() => void recordsQuery.refetch()} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
        {selectedRecord ? (
          <Panel
            title={`檢驗內容與簽核　IQC-${selectedRecord.id}`}
            description="以下檢驗內容由後端回傳；簽核結果與狀態由後端在同一交易內驗證並更新。"
          >
            <div className="grid gap-4 border-b border-slate-100 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail
                label="檢驗對象"
                value={
                  selectedRecord.internal_lot_no ??
                  (selectedRecord.internal_lot_id
                    ? `內部批號 ${selectedRecord.internal_lot_id}`
                    : selectedRecord.receipt_id
                      ? `收料單 ${selectedRecord.receipt_id}`
                      : '—')}
              />
              <Detail label="抽樣數量" value={selectedRecord.sample_qty} />
              <Detail
                label="檢驗日期"
                value={
                  selectedRecord.inspection_date
                    ? new Date(selectedRecord.inspection_date).toLocaleDateString('zh-TW')
                    : '—'
                }
              />
              <Detail label="檢驗結果" value={statusLabel(selectedRecord.inspection_result)} />
              <Detail label="放行狀態" value={statusLabel(selectedRecord.release_status)} />
              <Detail
                label="目前簽核狀態"
                value={reviewLabel(selectedRecord.review_status || 'pending')}
              />
              <Detail label="檢驗備註" value={selectedRecord.remarks || '無'} />
            </div>

            {(canApprove || canReturn) && (
              <div className="mt-5 space-y-3">
                <FormField label="簽核意見">
                  <textarea
                    className={`${inputClass} min-h-20 resize-y`}
                    value={decision.note}
                    onChange={(event) =>
                      setDecision((old) => ({ ...old, note: event.target.value }))
                    }
                    placeholder="如：檢驗文件齊全，核准放行。"
                  />
                </FormField>
                <FormField
                  label="退回理由（退回時必填）"
                  error={error.includes('退回理由') ? error : undefined}
                >
                  <textarea
                    className={`${inputClass} min-h-20 resize-y`}
                    value={decision.reason}
                    onChange={(event) => {
                      setDecision((old) => ({ ...old, reason: event.target.value }))
                      if (error.includes('退回理由')) setError('')
                    }}
                    placeholder="請輸入退回理由，例如：缺少供應商檢驗報告。"
                  />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  {canApprove && (
                    <ConfirmDialog
                      trigger={
                        <button type="button" className={buttonClass}>
                          核准
                        </button>
                      }
                      title="確定核准此檢驗紀錄？"
                      description={`將核准 IQC-${selectedRecord.id}，並保存簽核人員、時間與意見。`}
                      confirmLabel="確認核准"
                      onConfirm={() => submit('approve')}
                    />
                  )}
                  {canReturn && (
                    <ConfirmDialog
                      trigger={
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={(event) => {
                            if (!decision.reason.trim()) {
                              event.preventDefault()
                              setError('退回時必須填寫退回理由。')
                            }
                          }}
                        >
                          退回
                        </button>
                      }
                      title="確定退回此檢驗紀錄？"
                      description={`將退回 IQC-${selectedRecord.id}，退回理由為「${decision.reason.trim() || '（未填寫）'}」。`}
                      confirmLabel="確認退回"
                      destructive
                      onConfirm={() => submit('return')}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="mb-2 text-sm font-semibold text-slate-900">簽核歷程</p>
              {historyLoading ? (
                <LoadingState label="正在載入簽核歷程…" />
              ) : history?.length ? (
                <div className="space-y-2">
                  {history.map((review) => (
                    <div key={review.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <StatusBadge
                            value={review.review_status}
                            label={reviewLabel(review.review_status)}
                          />
                          <span className="text-xs text-slate-600">
                            簽核人員：
                            {review.reviewed_by_username ||
                              `使用者 ${review.reviewed_by_user_id ?? '—'}`}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {review.reviewed_at
                            ? new Date(review.reviewed_at).toLocaleString('zh-TW')
                            : '—'}
                        </span>
                      </div>
                      {review.decision_note && (
                        <p className="mt-2 text-xs text-slate-600">意見：{review.decision_note}</p>
                      )}
                      {review.reason && (
                        <p className="mt-1 text-xs text-rose-700">退回理由：{review.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="尚無簽核歷程" description="此檢驗紀錄尚未進行簽核。" />
              )}
            </div>
          </Panel>
        ) : (
          <Panel title="檢驗內容與簽核">
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
              <ClipboardSignature className="h-6 w-6 text-slate-400" />
              請從右側清單選擇一筆待簽核紀錄。
            </div>
          </Panel>
        )}

        <Panel
          title="待簽核清單"
          description={`共 ${records?.total ?? '—'} 筆 · 點選紀錄以檢視內容並簽核`}
          action={
            <button type="button" className={secondaryButtonClass} onClick={() => void recordsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              重新整理
            </button>
          }
        >
          <div className="mb-4 max-w-xs">
            <FormField label="簽核狀態">
              <select
                className={inputClass}
                value={reviewFilter}
                onChange={(event) => {
                  setPage(1)
                  setReviewFilter(event.target.value)
                }}
              >
                <option value="pending">待簽核</option>
                <option value="returned">已退回</option>
                <option value="approved">已核准</option>
                <option value="">全部狀態</option>
              </select>
            </FormField>
          </div>

          {loading ? (
            <LoadingState label="正在載入待簽核紀錄…" />
          ) : records?.items.length ? (
            <DataTable>
              <TableHead>
                <TableRow>
                  <Th>檢驗紀錄</Th>
                  <Th>檢驗對象</Th>
                  <Th>檢驗結果</Th>
                  <Th>放行狀態</Th>
                  <Th>簽核狀態</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.items.map((record) => (
                  <TableRow
                    key={record.id}
                    onClick={() => {
                      selectedIdRef.current = record.id
                      setSelectedId(record.id)
                      setDecision({ note: '', reason: '' })
                      setSuccess('')
                    }}
                    className={`cursor-pointer ${selectedId === record.id ? 'bg-sky-50/70' : ''}`}
                  >
                    <Td className="font-medium text-slate-950">IQC-{record.id}</Td>
                    <Td>
                      {record.internal_lot_no ??
                        (record.internal_lot_id
                          ? `內部批號 ${record.internal_lot_id}`
                          : record.receipt_id
                            ? `收料單 ${record.receipt_id}`
                            : '—')}
                    </Td>
                    <Td>
                      <StatusBadge value={record.inspection_result} />
                    </Td>
                    <Td>
                      <StatusBadge value={record.release_status} />
                    </Td>
                    <Td>
                      <StatusBadge
                        value={record.review_status || 'pending'}
                        label={reviewLabel(record.review_status || 'pending')}
                      />
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          ) : (
            <EmptyState
              title="目前沒有待簽核的檢驗紀錄"
              description={
                reviewFilter
                  ? '可切換上方簽核狀態檢視其他紀錄。'
                  : '建立 IQC 檢驗紀錄後，待簽核資料會顯示於此。'
              }
            />
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>共 {records?.total ?? 0} 筆</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                上一頁
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                下一頁
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}
