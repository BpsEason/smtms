import { Activity, Boxes, ClipboardCheck, ClipboardSignature, Factory, LayoutDashboard, LogOut, PackageCheck, SearchCheck, ShieldCheck, Truck, TriangleAlert, ScrollText } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import type { UserProfile } from '../types'

type NavItem = { group: string; label: string; to: string; icon: typeof Activity; permission: string | null; permissions?: string[]; anyPermissions?: string[] }

const navigation: NavItem[] = [
  // 工作總覽
  { group: '工作總覽', label: '儀表板', to: '/', icon: LayoutDashboard, permission: null },

  // 主檔資料
  { group: '主檔資料', label: '供應商', to: '/suppliers', icon: Truck, permission: 'suppliers:read' },
  { group: '主檔資料', label: '物料', to: '/materials', icon: Boxes, permission: 'materials:read' },

  // 進料與追溯（依實際作業順序）
  { group: '進料與追溯', label: '收料紀錄', to: '/receipts', icon: PackageCheck, permission: 'receipts:read' },
  { group: '進料與追溯', label: '內部批號', to: '/internal-lots', icon: Factory, permission: 'materials:read' },
  { group: '進料與追溯', label: '進料檢驗（IQC）', to: '/iqc', icon: ClipboardCheck, permission: 'iqc:read' },
  { group: '進料與追溯', label: '品保簽核', to: '/signoff', icon: ClipboardSignature, permission: null, anyPermissions: ['quality:review', 'quality:approve', 'quality:return'] },
  { group: '進料與追溯', label: '品質異常', to: '/nonconformances', icon: TriangleAlert, permission: 'nonconformance:read' },
  { group: '進料與追溯', label: '全鏈路追溯', to: '/traceability', icon: SearchCheck, permission: null, permissions: ['receipts:read', 'materials:read', 'iqc:read'] },

  // 系統設定
  { group: '系統設定', label: '角色與權限', to: '/admin/roles', icon: ShieldCheck, permission: 'users:manage' },
  { group: '系統設定', label: '稽核紀錄', to: '/admin/audit-logs', icon: ScrollText, permission: 'audit:read' },
]

export function AdminLayout({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
  const links = navigation.filter((item) => item.anyPermissions ? item.anyPermissions.some((permission) => profile.permissions.includes(permission)) : item.permissions ? item.permissions.every((permission) => profile.permissions.includes(permission)) : item.permission === null || profile.permissions.includes(item.permission))
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-slate-900 text-slate-200">
        <nav className="space-y-1 px-3">
          {links.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm font-medium text-slate-700">{profile.username}</div>
          <button type="button" onClick={onLogout} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </header>
        <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}