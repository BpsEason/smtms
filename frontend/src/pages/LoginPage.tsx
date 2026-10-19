import { useState, type FormEvent } from 'react'
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { FormField, inputClass } from '../components/ui'

export function LoginPage({ onLogin, loading }: { onLogin: (username: string, password: string) => Promise<void>; loading: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    try { await onLogin(username.trim(), password); navigate('/', { replace: true }) }
    catch (err) { setError(err instanceof ApiError ? err.details : 'Unable to sign in. Check your connection and try again.') }
  }
  return <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.78fr)]">
    <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex xl:p-16"><div className="absolute inset-y-0 right-0 w-px bg-white/10" /><div><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-sky-700"><Activity className="h-5 w-5" /></span><span className="font-semibold tracking-wide">SMTMS</span></div><div className="mt-24 max-w-xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Supplier & Material Traceability</p><h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Quality operations, grounded in traceable data.</h1><p className="mt-5 max-w-lg text-base leading-7 text-slate-300">Coordinate inbound material, lot identity and inspection decisions through one auditable workflow.</p></div></div><div className="flex items-center gap-2 text-sm text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-400" />Role and permission controlled access</div></section>
    <section className="flex items-center justify-center px-5 py-12 sm:px-10"><div className="w-full max-w-[390px]"><div className="mb-8 lg:hidden"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-slate-900 text-white"><Activity className="h-5 w-5" /></span><span className="font-semibold tracking-wide">SMTMS</span></div></div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Secure workspace</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Sign in to SMTMS</h2><p className="mt-2 text-sm text-slate-600">Use your assigned account to access quality operations.</p>
      <form onSubmit={submit} className="mt-8 space-y-5"><FormField label="Username"><input className={inputClass} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></FormField><FormField label="Password"><input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField>{error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}<button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60" disabled={loading || !username || !password}>{loading ? 'Verifying account…' : <>Sign in <ArrowRight className="h-4 w-4" /></>}</button></form><p className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">Access to operational records is governed by your assigned role and permissions.</p></div></section>
  </main>
}
