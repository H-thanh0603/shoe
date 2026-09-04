import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useCart } from '../store/CartContext.jsx'

const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫'

// Nhận giỏ do agent (hoặc người khác) chia sẻ: gộp vào giỏ trình duyệt rồi mở ra
export default function ClaimCart({ token }) {
  const [state, setState] = useState({ phase: 'loading', cart: null, err: null })
  const { open: openCart } = useCart()

  useEffect(() => {
    apiFetch('/cart/claim', { method: 'POST', body: { token } })
      .then((cart) => setState({ phase: 'done', cart, err: null }))
      .catch((e) => setState({ phase: 'error', cart: null, err: e.message }))
  }, [token])

  return (
    <main className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:px-8 md:pt-32">
      <p className="font-mono text-xs tracking-widest text-accent">GIỎ CHIA SẺ //</p>
      <h1 className="display-l mt-1 text-paper">NHẬN GIỎ HÀNG<span className="text-accent">.</span></h1>

      {state.phase === 'loading' && (
        <p className="mt-6 font-mono text-xs tracking-widest text-paper/50">ĐANG GỘP GIỎ VÀO TRÌNH DUYỆT…</p>
      )}

      {state.phase === 'error' && (
        <div className="mt-6 border border-white/10 bg-charcoal p-6 text-center">
          <p className="font-mono text-xs text-accent">{state.err}</p>
          <a href="#shop" className="mt-4 inline-block border border-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-accent hover:bg-accent hover:text-ink">
            TỰ CHỌN GIÀY →
          </a>
        </div>
      )}

      {state.phase === 'done' && (
        <div className="mt-6 border border-white/10 bg-charcoal p-6">
          <p className="text-sm text-paper/70">
            Đã gộp <span className="font-bold text-accent">{state.cart.merged} món</span> vào
            giỏ của bạn (giỏ nguồn đã xóa để khỏi mua trùng).
          </p>
          <ul className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            {state.cart.items.map((it) => (
              <li key={it.itemId} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-paper/80">{it.name} <span className="font-mono text-xs text-paper/50">· size {it.size} · x{it.qty}</span></span>
                <span className="font-mono text-paper">{vnd(it.lineTotalVnd)}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => { location.hash = ''; openCart() }}
            className="mt-6 w-full border border-accent bg-accent py-3.5 font-display text-sm font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent"
          >
            MỞ GIỎ & THANH TOÁN →
          </button>
        </div>
      )}
    </main>
  )
}
