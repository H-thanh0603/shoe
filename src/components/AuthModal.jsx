import { useState } from 'react'

// Login/Register modal (Bước 6) — JWT httpOnly cookie, server quản session
const inputCls = 'w-full border border-white/15 bg-ink-deep px-3 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-accent focus:outline-none'
const labelCls = 'mb-1 block text-[10px] font-semibold tracking-widest text-paper/60'

async function api(path, body) {
  const r = await fetch(`/api/v1/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json()
  if (!r.ok || !data.success) throw new Error(data?.error?.message || `HTTP ${r.status}`)
  return data.data
}

export default function AuthModal({ onClose, onAuthed }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const u = mode === 'login'
        ? await api('/login', { email: form.email, password: form.password })
        : await api('/register', { email: form.email, password: form.password, name: form.name })
      onAuthed(u)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Tài khoản">
      <button aria-label="Đóng" className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 border border-white/10 bg-charcoal p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-paper">
            {mode === 'login' ? <>ĐĂNG NHẬP<span className="text-accent">.</span></> : <>ĐĂNG KÝ<span className="text-accent">.</span></>}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-sm tracking-widest text-paper/70 transition-colors hover:text-accent">✕</button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <div>
              <label className={labelCls} htmlFor="au-name">HỌ VÀ TÊN</label>
              <input id="au-name" required minLength={2} className={inputCls} value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="au-email">EMAIL</label>
            <input id="au-email" required type="email" className={inputCls} value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div>
            <label className={labelCls} htmlFor="au-pass">MẬT KHẨU</label>
            <input id="au-pass" required type="password" minLength={8} className={inputCls} value={form.password} onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Tối thiểu 8 ký tự" />
          </div>

          {err && <p className="text-xs text-accent" role="alert">{err}</p>}

          <button type="submit" disabled={busy} className="w-full bg-accent py-3.5 font-display text-sm font-bold tracking-widest text-ink transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? 'ĐANG XỬ LÝ…' : mode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-paper/50">
          {mode === 'login' ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(null) }} className="text-accent hover:underline">
            {mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
          </button>
        </p>
      </div>
    </div>
  )
}
