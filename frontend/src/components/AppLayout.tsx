import { Activity, Boxes, ClipboardCheck, Factory, LayoutDashboard, LogOut, PackageCheck, ShieldCheck, Truck } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import type { UserProfile } from '../types'
import { buttonClass } from './ui'

const navigation = [
  { group: '工作總覽', label: '儀表板', to: '/', icon: LayoutDashboard, permission: null },
  { group: '主檔資料', label: '供應商', to: '/suppliers', icon: Truck, permission: 'suppliers:read' },
  { group: '主檔資料', label: '物料', to: '/materials', icon: Boxes, permission: 'materials:read' },
  { group: '進料與追溯', label: '收料紀錄', to: '/receipts', icon: PackageCheck, permission: 'receipts:read' },
  { group: '進料與追溯', label: '內部批號', to: '/internal-lots', icon: Factory, permission: 'materials:read' },
  { group: '進料與追溯', label: '進料檢驗（IQC）', to: '/iqc', icon: ClipboardCheck, permission: 'iqc:read' },
  { group: '系統設定', label: '角色與權限', to: '/admin/roles', icon: ShieldCheck, permission: 'users:manage' },
]

export function AppLayout({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
  const links = navigation.filter((item) => item.permission === null || profile.permissions.includes(item.permission))
  return <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
    <aside className="flex w-full flex-col border-b border-slate-800 bg-slate-950 text-slate-200 lg:fixed lg:inset-y-0 lg:w-[252px] lg:border-b-0 lg:border-r lg:border-slate-800">
      <div className="flex items-center gap-3 px-5 py-5"><div className="grid h-9 w-9 place-items-center rounded-md bg-sky-700 text-white"><Activity className="h-5 w-5" /></div><div><p className="text-sm font-semibold tracking-wide text-white">SMTMS</p><p className="text-xs text-slate-400">供應商與物料追溯管理系統</p></div></div>
      <div className="hidden px-5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:block">作業選單</div>
      <nav aria-label="主要導覽" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
        {['工作總覽', '主檔資料', '進料與追溯', '系統設定'].map((group) => {
          const items = links.filter((item) => item.group === group)
          if (!items.length) return null
          return <div key={group} className="flex shrink-0 gap-1 lg:mb-2 lg:flex-col">
            <p className="hidden px-3 pb-1 pt-3 text-[10px] font-semibold tracking-wide text-slate-500 lg:block">{group}</p>
            {items.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-slate-800 font-medium text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}><Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span></NavLink>)}
          </div>
        })}
      </nav>
      <div className="mt-auto hidden border-t border-slate-800 p-4 lg:block"><div className="mb-3 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-semibold uppercase text-slate-200">{profile.username.slice(0, 2)}</div><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{profile.username}</p><p className="truncate text-xs text-slate-400">{profile.roles.join('、') || '未指派角色'}</p></div></div><button className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white" onClick={onLogout}><LogOut className="h-4 w-4" />登出</button></div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 lg:hidden"><span className="truncate text-xs text-slate-400">{profile.username} · {profile.roles.join('、') || '未指派角色'}</span><button onClick={onLogout} className={`${buttonClass} min-h-8 bg-slate-800 px-2.5 py-1 text-xs hover:bg-slate-700`}><LogOut className="h-3.5 w-3.5" />登出</button></div>
    </aside>
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:ml-[252px] lg:px-9 lg:py-8"><div className="mx-auto max-w-[1440px]"><Outlet /></div></main>
  </div>
}
