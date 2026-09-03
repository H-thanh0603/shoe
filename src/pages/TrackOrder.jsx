import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api.js'
import { playTechClick } from '../lib/sound.js'

const STEPS = ['pending', 'paid', 'shipped', 'done']
const LABEL = {
  pending: 'ĐÃ TIẾP NHẬN',
  paid: 'ĐÃ THANH TOÁN',
  shipped: 'ĐANG GIAO',
  done: 'HOÀN TẤT',
  cancelled: 'ĐÃ HỦY',
}
const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫'

export default function TrackOrder({ initialCode }) {
  const [code, setCode] = useState(initialCode || '')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const lookup = async (c) => {
    const q = (c ?? code).trim().toUpperCase()
    if (!q) return
    setLoading(true); setErr(null); setOrder(null)
    try {
      setOrder(await apiGet(`/orders/ref/${encodeURIComponent(q)}`))
    } catch {
      setErr('Không tìm thấy đơn hàng — kiểm tra lại mã (vd: KIN-AB12CD).')
    } finally {
      setLoading(false)
    }
  }

  // mở từ link checkout #/tra-don/KIN-XXXX → tra cứu ngay
  useEffect(() => {
    if (initialCode) { setCode(initialCode); lookup(initialCode) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode])

  const stepIdx = order ? STEPS.indexOf(order.status) : -1

  return (
    <main className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:px-8 md:pt-32">
      <p className="font-mono text-xs tracking-widest text-accent">TRA CỨU // ĐƠN HÀNG</p>
      <h1 className="display-l mt-1 text-paper">ĐƠN CỦA BẠN<span className="text-accent">.</span></h1>

      <form
        className="mt-8 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); playTechClick(); lookup() }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="NHẬP MÃ ĐƠN: KIN-XXXXXX"
          className="flex-1 border border-white/20 bg-charcoal px-4 py-3.5 font-mono text-sm uppercase tracking-widest text-paper placeholder:text-paper/30 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="border border-accent bg-accent px-6 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent disabled:opacity-50"
        >
          {loading ? '…' : 'TRA CỨU'}
        </button>
      </form>

      {err && <p className="mt-4 font-mono text-xs text-accent" role="alert">{err}</p>}

      {order && (
        <div className="mt-8 border border-white/10 bg-charcoal p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-xl font-bold tracking-widest text-paper">{order.ref_code}</p>
            <span className={`px-2 py-0.5 font-mono text-[11px] font-bold ${order.status === 'cancelled' ? 'bg-white/10 text-paper/60' : 'bg-accent text-ink'}`}>
              {LABEL[order.status] || order.status}
            </span>
          </div>

          {/* Timeline */}
          {order.status !== 'cancelled' && (
            <ol className="mt-6 flex items-center gap-0">
              {STEPS.map((s, i) => (
                <li key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${i <= stepIdx ? 'border-accent bg-accent text-ink' : 'border-white/20 text-paper/40'}`}>
                      {i <= stepIdx ? '✓' : i + 1}
                    </span>
                    <span className={`font-mono text-[9px] tracking-wider ${i <= stepIdx ? 'text-accent' : 'text-paper/40'}`}>{LABEL[s]}</span>
                  </div>
                  {i < STEPS.length - 1 && <span className={`mx-1 mb-5 h-px flex-1 ${i < stepIdx ? 'bg-accent' : 'bg-white/15'}`} />}
                </li>
              ))}
            </ol>
          )}

          <ul className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-4">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-paper/80">{it.name_snapshot} <span className="font-mono text-xs text-paper/50">· size {it.size_snapshot} · x{it.qty}</span></span>
                <span className="font-mono text-paper">{vnd(it.qty * it.unit_price_vnd)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-4 font-mono text-xs text-paper/60">
            <div className="flex justify-between"><dt>TẠM TÍNH</dt><dd className="text-paper">{vnd(order.subtotalVnd)}</dd></div>
            {order.discount_vnd > 0 && <div className="flex justify-between text-accent"><dt>GIẢM GIÁ</dt><dd>−{vnd(order.discount_vnd)}</dd></div>}
            <div className="flex justify-between"><dt>PHÍ SHIP</dt><dd className="text-paper">{order.shipping_fee_vnd > 0 ? vnd(order.shipping_fee_vnd) : 'MIỄN PHÍ'}</dd></div>
            <div className="flex justify-between pt-1 text-sm font-bold"><dt className="text-paper">TỔNG</dt><dd className="text-accent">{vnd(order.total_vnd)}</dd></div>
            <div className="flex justify-between pt-1"><dt>ĐẶT LÚC</dt><dd>{new Date(order.created_at).toLocaleString('vi-VN')}</dd></div>
          </dl>
        </div>
      )}
    </main>
  )
}
