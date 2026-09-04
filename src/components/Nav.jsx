import { useEffect, useRef, useState } from 'react'
import { useCart } from '../store/CartContext.jsx'
import { useProfile, topTrait } from '../store/profile.js'
import { apiFetch } from '../lib/api.js'
import AuthModal from './AuthModal.jsx'

const menu = {
  SHOP: ['Running', 'Street', 'Court', 'Lifestyle'],
  NEW: ['Just landed', 'Coming soon'],
  COLLECTIONS: ['Street Future', 'Night Runner', 'Raw Motion', 'City Heat'],
}

export default function Nav({ onQuiz, onLogoTap, secret, onSearch }) {
  const [open, setOpen] = useState(null)
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const { cart, open: openCart } = useCart()
  const { profile } = useProfile()
  const shoeId = topTrait(profile) || 'SHOE ID'

  // logo 5 tap trong 2s → secret toggle (mobile path, konami cho desktop)
  const taps = useRef([])
  const onLogo = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 2000), now]
    if (taps.current.length >= 5) { taps.current = []; onLogoTap?.() }
  }

  useEffect(() => {
    // access hết hạn (1h) → đổi refresh_token (7d) lấy access mới rồi fetch lại
    const me = (retried) =>
      apiFetch('/auth/me').catch(async (e) => {
        if (!retried && e.status === 401) {
          try { await apiFetch('/auth/refresh', { method: 'POST' }); return me(true) } catch { /* hết phiên */ }
        }
        return Promise.reject(e)
      })
    me(false).then(setUser).catch(() => {})
  }, [])

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    window.dispatchEvent(new CustomEvent('auth-changed')) // wishlist về localStorage
  }

  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-ink/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <a href="#" onClick={onLogo} className="font-display text-xl font-bold tracking-tight text-paper">
          KINETIC<span className="text-accent">.</span>
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {Object.keys(menu).map((k) => (
            <li key={k} className="relative">
              <button
                className="flex items-center gap-1 text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent"
                onMouseEnter={() => setOpen(k)}
                onFocus={() => setOpen(k)}
                onClick={() => setOpen(open === k ? null : k)}
              >
                {k}
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 2l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-5">
          <button
            onClick={onSearch}
            aria-label="Tìm kiếm (Cmd+K)"
            className="flex items-center gap-1.5 text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent"
          >
            SEARCH
            <span className="hidden lg:inline-block font-mono text-[9px] text-paper/40 border border-white/15 px-1 rounded">⌘K</span>
          </button>
          <button onClick={onQuiz} className={`text-sm font-medium tracking-widest transition-colors duration-200 hover:text-accent focus-visible:text-accent ${profile ? 'text-accent' : 'text-paper/80'}`}>
            {shoeId}
          </button>
          <a href="#/tra-don" className="hidden text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent sm:inline">
            TRA ĐƠN
          </a>
          {user && (
            <a href="#/don-cua-toi" className="hidden text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent sm:inline">
              ĐƠN CỦA TÔI
            </a>
          )}
          {user?.role === 'admin' && (
            <a href="#/admin" className="hidden text-sm font-medium tracking-widest text-accent transition-colors duration-200 hover:text-accent-hot sm:inline">
              ADMIN
            </a>
          )}
          {user ? (
            <button onClick={logout} className="text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent">
              {(user.name || user.email).split('@')[0].toUpperCase()} · ĐĂNG XUẤT
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)} className="text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent">
              ACCOUNT
            </button>
          )}
          <button onClick={openCart} aria-label={`Giỏ hàng, ${cart.count} sản phẩm`} className="relative text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent">
            BAG
            {cart.count > 0 && (
              <span className="absolute -top-2 -right-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-ink">{cart.count}</span>
            )}
          </button>
        </div>
      </nav>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={(u) => {
            setUser(u)
            setShowAuth(false)
            window.dispatchEvent(new CustomEvent('auth-changed')) // wishlist merge lên server
          }}
        />
      )}

      {/* mega menu (N11) — hover mở, categories + visual */}
      {open && (
        <div
          className="absolute top-full left-0 hidden w-full border-t border-white/10 bg-charcoal/95 backdrop-blur-md md:block"
          onMouseLeave={() => setOpen(null)}
        >
          <div className="mx-auto grid max-w-7xl grid-cols-4 gap-8 px-8 py-8">
            {menu[open].map((item) => (
              <a
                key={item}
                href="#"
                className="group flex h-28 items-end border border-white/10 bg-ink-deep p-4 transition-colors duration-200 hover:border-accent focus-visible:border-accent"
              >
                <span className="font-display text-lg font-semibold text-paper group-hover:text-accent">
                  {item}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
