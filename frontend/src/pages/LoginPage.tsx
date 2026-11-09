import { useState, type FormEvent } from 'react'
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Flex, Input, Typography } from 'antd'
import { ApiError } from '../api'
import { FormField } from '../components/ui'

const { Text, Title, Paragraph } = Typography

export function LoginPage({ onLogin, loading }: { onLogin: (username: string, password: string) => Promise<void>; loading: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    try { await onLogin(username.trim(), password); navigate('/', { replace: true }) }
    catch (err) { setError(err instanceof ApiError && err.status === 401 ? '帳號或密碼錯誤，或帳號尚未啟用，請確認後再試一次。' : err instanceof ApiError ? `登入失敗：${err.details}` : '登入失敗，請確認網路連線後再試一次。') }
  }
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.78fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex xl:p-16">
        <div className="absolute inset-y-0 right-0 w-px bg-white/10" />
        <div>
          <Flex align="center" className="gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-sky-700"><Activity className="h-5 w-5" /></span>
            <span className="font-semibold tracking-wide">SMTMS</span>
          </Flex>
          <div className="mt-24 max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">供應商與物料追溯管理系統</p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">以可追溯資料，落實品質管理。</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">整合進料收貨、批號管理與檢驗判定，建立可追蹤的品保作業流程。</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-400" />依角色與權限控管系統存取</div>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[390px]">
          <div className="mb-8 lg:hidden">
            <Flex align="center" className="gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-900 text-white"><Activity className="h-5 w-5" /></span>
              <span className="font-semibold tracking-wide">SMTMS</span>
            </Flex>
          </div>
          <Text type="secondary" className="!text-xs !font-semibold uppercase tracking-[0.16em] !text-slate-500">安全登入</Text>
          <Title level={2} className="mt-2 !text-2xl !font-semibold tracking-tight !text-slate-950">登入 SMTMS</Title>
          <Paragraph className="mt-2 !text-sm !text-slate-600">請使用已指派的帳號登入品保作業系統。</Paragraph>
          <form onSubmit={submit} className="mt-8">
            <div className="space-y-5">
              <FormField label="帳號"><Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required className="w-full" /></FormField>
              <FormField label="密碼"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full" /></FormField>
              {error && <Alert type="error" showIcon title={error} className="!rounded-md !border-rose-200 !bg-rose-50 !px-3 !py-2 !text-sm !text-rose-800" />}
            </div>
            <Button type="primary" htmlType="submit" disabled={loading || !username || !password} className="!mt-8 !min-h-10 !w-full !rounded-md !bg-slate-900 !px-4 !text-sm !font-semibold !text-white !hover:!bg-slate-700 !disabled:!opacity-60">
              <Flex align="center" gap={8}>{loading ? '正在驗證帳號…' : <>登入 <ArrowRight className="h-4 w-4" /></>}</Flex>
            </Button>
          </form>
          <Paragraph className="mt-8 border-t border-slate-200 pt-5 !text-xs leading-5 text-slate-500">作業資料存取權限依您的角色與授權設定控管。</Paragraph>
        </div>
      </section>
    </main>
  )
}
