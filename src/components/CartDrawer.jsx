import { useEffect, useState } from 'react'
import { useCart } from '../store/CartContext.jsx'
import CheckoutForm from './CheckoutForm.jsx'

// Slide-over cart (DESIGN.md cùng visual language: ink/paper/accent, display font)
export default function CartDrawer() {
  const { cart, setQty, remove, clear, close } = useCart()
  const [checkout, setCheckout] = useState(false)
  useEffect(() => { if (!cart.open) setCheckout(false) }, [cart.open])
  if (!cart.open) return null

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Giỏ hàng">
      <button aria-label="Đóng giỏ hàng" className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={close} />
      <aside className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-charcoal">
        <header className="flex items-center justify-between border-b border-white/10 p-6">
          <h2 className="font-display text-2xl font-bold tracking-tight text-paper">
            {checkout ? 'CHECKOUT' : <>BAG<span className="text-accent">.</span> {cart.count}</>}
          </h2>
          <button onClick={close} aria-label="Đóng" className="text-sm tracking-widest text-paper/70 transition-colors hover:text-accent">
            ĐÓNG ✕
          </button>
        </header>

        {checkout && (
          <CheckoutForm
            totalVnd={cart.totalVnd}
            onDone={() => { clear(); close() }}
            onBack={() => setCheckout(false)}
          />
        )}

        <div className={`flex-1 overflow-y-auto p-6 ${checkout ? 'hidden' : ''}`}>
          {cart.items.length === 0 ? (
            <p className="py-16 text-center text-sm tracking-widest text-paper/50">GIỎ TRỐNG</p>
          ) : (
            <ul className="space-y-4">
              {cart.items.map((it) => (
                <li key={it.itemId} className="flex gap-4 border border-white/10 bg-ink-deep p-4">
                  <div
                    className="h-20 w-20 shrink-0 border border-white/10"
                    style={{ background: `linear-gradient(135deg, ${it.colors.join(', ')})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <a href={`#/san-pham/${it.slug}`} className="font-display text-sm font-semibold text-paper hover:text-accent">{it.name}</a>
                    <p className="mt-1 text-xs tracking-widest text-paper/60">SIZE {it.size} — {it.price}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setQty(it.itemId, it.qty - 1)} disabled={it.qty <= 1} aria-label="Giảm" className="h-7 w-7 border border-white/15 text-paper/80 transition-colors hover:border-accent hover:text-accent disabled:opacity-30">−</button>
                      <span className="w-8 text-center text-sm text-paper">{it.qty}</span>
                      <button onClick={() => setQty(it.itemId, it.qty + 1)} disabled={it.qty >= it.stock} aria-label="Tăng" className="h-7 w-7 border border-white/15 text-paper/80 transition-colors hover:border-accent hover:text-accent disabled:opacity-30">+</button>
                      <button onClick={() => remove(it.itemId)} className="ml-auto text-xs tracking-widest text-paper/50 transition-colors hover:text-accent">XÓA</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.items.length > 0 && !checkout && (
          <footer className="border-t border-white/10 p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm tracking-widest text-paper/70">TỔNG</span>
              <span className="font-display text-xl font-bold text-paper">
                {cart.totalVnd.toLocaleString('vi-VN')}₫
              </span>
            </div>
            <button onClick={() => setCheckout(true)} className="w-full bg-accent py-4 font-display text-sm font-bold tracking-widest text-ink transition-opacity hover:opacity-90">
              THANH TOÁN
            </button>
          </footer>
        )}
      </aside>
    </div>
  )
}
