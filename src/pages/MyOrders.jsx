import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api.js'

const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫'
const LABEL = { pending: 'CHỜ XỬ LÝ', paid: 'ĐÃ THANH TOÁN', shipped: 'ĐANG GIAO', done: 'HOÀN TẤT', cancelled: 'ĐÃ HỦY' }

export default function MyOrders() {
  const [orders, setOrders] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    apiGet('/orders/me/orders').then(setOrders).catch((e) => {
      setErr(e.status === 401 ? 'Đăng nhập để xem đơn của bạn.' : e.message)
    })
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:px-8 md:pt-32">
      <p className="font-mono text-xs tracking-widest text-accent">TÀI KHOẢN // ĐƠN HÀNG</p>
      <h1 className="display-l mt-1 text-paper">ĐƠN CỦA TÔI<span className="text-accent">.</span></h1>

      {err && <p className="mt-6 font-mono text-xs text-accent" role="alert">{err}</p>}

      {orders && orders.length === 0 && (
        <p className="mt-6 text-sm text-paper/60">Bạn chưa có đơn nào. <a href="#shop" className="text-accent hover:underline">Mua sắm ngay →</a></p>
      )}

      {orders?.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <a href={`#/tra-don/${o.ref_code}`} className="flex items-center justify-between gap-3 border border-white/10 bg-charcoal px-4 py-3 transition-colors hover:border-accent">
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-bold tracking-widest text-paper">{o.ref_code}</span>
                  <span className="font-mono text-[11px] text-paper/50">
                    {o.item_count} món · {new Date(o.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-sm font-bold text-accent">{vnd(o.total_vnd)}</span>
                  <span className={`px-2 py-0.5 font-mono text-[10px] font-bold ${o.status === 'cancelled' ? 'bg-white/10 text-paper/60' : 'bg-accent/15 text-accent'}`}>
                    {LABEL[o.status] || o.status}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
