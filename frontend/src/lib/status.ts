const statusLabels: Record<string, string> = {
  active: '啟用',
  available: '可用',
  passed: '合格',
  released: '已放行',
  approved: '已核准',
  returned: '已退回',
  complete: '已完成',
  completed: '已完成',
  pending: '待檢',
  hold: '暫緩放行',
  quarantine: '待檢隔離',
  received: '已收料',
  in_progress: '處理中',
  failed: '檢驗不合格',
  rejected: '判退',
  inactive: '停用',
  blocked: '已封鎖',
  investigating: '調查中',
  pending_confirmation: '待確認',
  closed: '已結案',
}

export function statusLabel(value: string) {
  return statusLabels[value.toLowerCase()] ?? value
}

const severityLabels: Record<string, string> = {
  critical: '嚴重',
  high: '高',
  medium: '中',
  low: '低',
}

export function severityLabel(value: string) {
  return severityLabels[value.toLowerCase()] ?? value
}
