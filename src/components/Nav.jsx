import { useEffect, useState } from 'react'
import { useCart } from '../store/CartContext.jsx'
import AuthModal from './AuthModal.jsx'

const menu = {
  SHOP: ['Running', 'Street', 'Court', 'Lifestyle'],
  NEW: ['Just landed', 'Coming soon'],
  COLLECTIONS: ['Street Future', 'Night Runner', 'Raw Motion', 'City Heat'],
}

export default function Nav() {
  const [open, setOpen] = useState(null)
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const { cart, open: openCart } = useCart()

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setUser(b.data))
      .catch(() => {})
  }, [])

  const logout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-ink/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <a href="#" className="font-display text-xl font-bold tracking-tight text-paper">
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
          <button aria-label="Tìm kiếm" className="text-sm font-medium tracking-widest text-paper/80 transition-colors duration-200 hover:text-accent focus-visible:text-accent">
            SEARCH
          </button>
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
          onAuthed={(u) => { setUser(u); setShowAuth(false) }}
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
