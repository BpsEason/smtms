import { Activity, Boxes, ClipboardCheck, ClipboardSignature, Factory, LayoutDashboard, LogOut, PackageCheck, SearchCheck, ShieldCheck, Truck, TriangleAlert, ScrollText } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ProLayout } from '@ant-design/pro-components'
import type { UserProfile } from '../types'

type NavItem = { group: string; label: string; to: string; icon: typeof Activity; permission: string | null; permissions?: string[]; anyPermissions?: string[] }

const navigation: NavItem[] = [
  { group: '工作總覽', label: '儀表板', to: '/', icon: LayoutDashboard, permission: null },
  { group: '主檔資料', label: '供應商', to: '/suppliers', icon: Truck, permission: 'suppliers:read' },
  { group: '主檔資料', label: '物料', to: '/materials', icon: Boxes, permission: 'materials:read' },
  { group: '進料與追溯', label: '收料紀錄', to: '/receipts', icon: PackageCheck, permission: 'receipts:read' },
  { group: '進料與追溯', label: '內部批號', to: '/internal-lots', icon: Factory, permission: 'materials:read' },
  { group: '進料與追溯', label: '進料檢驗（IQC）', to: '/iqc', icon: ClipboardCheck, permission: 'iqc:read' },
  { group: '進料與追溯', label: '品保簽核', to: '/signoff', icon: ClipboardSignature, permission: null, anyPermissions: ['quality:review', 'quality:approve', 'quality:return'] },
  { group: '進料與追溯', label: '品質異常', to: '/nonconformances', icon: TriangleAlert, permission: 'nonconformance:read' },
  { group: '進料與追溯', label: '全鏈路追溯', to: '/traceability', icon: SearchCheck, permission: null, permissions: ['receipts:read', 'materials:read', 'iqc:read'] },
  { group: '系統設定', label: '角色與權限', to: '/admin/roles', icon: ShieldCheck, permission: 'users:manage' },
  { group: '系統設定', label: '稽核紀錄', to: '/admin/audit-logs', icon: ScrollText, permission: 'audit:read' },
]

const groups = ['工作總覽', '主檔資料', '進料與追溯', '系統設定']

export function AdminLayout({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
  const location = useLocation()
  const links = navigation.filter((item) => item.anyPermissions ? item.anyPermissions.some((permission) => profile.permissions.includes(permission)) : item.permissions ? item.permissions.every((permission) => profile.permissions.includes(permission)) : item.permission === null || profile.permissions.includes(item.permission))

  const menuData = groups.map((group) => {
    const items = links.filter((item) => item.group === group)
    if (!items.length) return null
    return {
      name: group,
      children: items.map((item) => {
        const Icon = item.icon
        return { key: item.to, path: item.to, name: item.label, icon: <Icon size={16} /> }
      }),
    }
  }).filter(Boolean) as any

  return (
    <ProLayout
      title="SMTMS"
      logo={<Activity size={20} />}
      layout="side"
      siderMenuType="group"
      location={{ pathname: location.pathname }}
      route={{ path: '/', routes: menuData as any }}
      menuItemRender={(item, defaultDom) => (
        <NavLink to={item.path || '/'}>
          {defaultDom}
        </NavLink>
      )}
      subMenuItemRender={(_, defaultDom) => defaultDom}
      actionsRender={() => [
        <div key="user-info" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>{profile.username}</span>
          <button type="button" onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: 'none', background: 'transparent' }}>
            <LogOut size={16} /> 登出
          </button>
        </div>
      ]}
    >
      <Outlet />
    </ProLayout>
  )
}

