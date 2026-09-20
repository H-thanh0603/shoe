// Ft6 oversized statement footer — shoe brand mark lớn, nav tối giản.
import { useState } from 'react'
import { POLICY_LINKS } from '../pages/Policy.jsx'
import { apiFetch } from '../lib/api.js'

function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | done | error
  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    try {
      await apiFetch('/newsletter', { method: 'POST', body: { email: email.trim() } })
      setState('done')
    } catch {
      setState('error')
    }
  }
  if (state === 'done') return <p className="mt-4 text-sm text-accent" role="status">Đã đăng ký — hẹn gặp ở drop tiếp theo.</p>
  return (
    <form className="mt-4 flex" onSubmit={submit}>
      <label htmlFor="footer-email" className="sr-only">Email</label>
      <input
        id="footer-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@cua ban"
        className="min-w-0 flex-1 border border-white/20 bg-transparent px-4 py-3 text-sm text-paper placeholder:text-paper/50 focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        className="shrink-0 border border-accent bg-accent px-5 text-sm font-semibold tracking-widest text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent focus-visible:bg-transparent focus-visible:text-accent disabled:opacity-50"
      >
        {state === 'sending' ? '…' : '→'}
      </button>
      {state === 'error' && <span className="sr-only" role="alert">Đăng ký thất bại — thử lại sau.</span>}
    </form>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-deep">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="font-display text-xl font-bold text-paper">
              KINETIC<span className="text-accent">.</span>
            </p>
            <p className="mt-3 max-w-xs text-sm text-paper/50">
              Futuristic streetwear footwear. Thiết kế cho chuyển động.
            </p>
          </div>
          <nav aria-label="Chân trang">
            <ul className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                ['SHOP', '/shop'],
                ['NEW', '/new'],
                ['COLLECTIONS', '/bo-suu-tap'],
                ['YÊU THÍCH', '/yeu-thich'],
                ['SIZE GUIDE', '/chinh-sach/huong-dan-size'],
                ...POLICY_LINKS,
              ].map(([l, href]) => (
                <li key={l}>
                  <a href={href} className="text-paper/60 transition-colors duration-200 hover:text-accent focus-visible:text-accent">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-sm text-paper/60">Nhận thông báo drop tiếp theo</p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 text-[11px] tracking-widest text-paper/40 md:flex-row md:items-center">
          <span>© 2026 KINETIC. ALL RIGHTS RESERVED.</span>
          <span>HANOI — SEOUL — TOKYO</span>
        </div>
        <p className="mt-4 font-mono text-[10px] tracking-wider text-paper/30">
          Model giày 3D: “Sneakers” bởi Poly by Google, CC-BY 3.0.
        </p>
      </div>
    </footer>
  )
}
