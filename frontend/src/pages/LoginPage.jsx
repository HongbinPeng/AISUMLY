import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

export function LoginPage() {
  const auth = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await auth.login(email, password)
      } else {
        await auth.register(email, password, nickname)
      }
    } catch (err) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 p-8">
      <section className="w-[420px] rounded-lg border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/70">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-yellow-400 font-black text-slate-950">S</div>
          <div>
            <h1 className="m-0 text-2xl font-black tracking-tight">AISUMLY</h1>
            <p className="mt-1 text-sm text-slate-500">登录后进入学习复盘助手。</p>
          </div>
        </div>

        <div className="my-6 grid grid-cols-2 gap-2">
          <button className={tabClass(mode === 'login')} onClick={() => setMode('login')} type="button">登录</button>
          <button className={tabClass(mode === 'register')} onClick={() => setMode('register')} type="button">注册</button>
        </div>

        <form className="grid gap-4" onSubmit={submit}>
          {mode === 'register' && (
            <label className="grid gap-2 text-sm font-bold">
              昵称
              <input className="rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例如：小林" />
            </label>
          )}
          <label className="grid gap-2 text-sm font-bold">
            邮箱
            <input className="rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            密码
            <input className="rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" />
          </label>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button className="rounded-lg bg-blue-600 py-3 font-black text-white disabled:opacity-60" disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </section>
    </main>
  )
}

function tabClass(active) {
  return `rounded-lg border px-3 py-2 font-bold ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`
}
