const statusLabels: Record<string, string> = {
  active: '啟用',
  available: '可用',
  passed: '合格',
  released: '已放行',
  approved: '已核准',
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
}

export function statusLabel(value: string) {
  return statusLabels[value.toLowerCase()] ?? value
}
