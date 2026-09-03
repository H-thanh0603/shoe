import { useState } from 'react'
import { apiFetch } from '../lib/api.js'

// Checkout step trong CartDrawer (Bước 5) — POST /api/v1/orders, Idempotency-Key chống double submit
const inputCls = 'w-full border border-white/15 bg-ink-deep px-3 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-accent focus:outline-none'
const labelCls = 'mb-1 block text-[10px] font-semibold tracking-widest text-paper/60'

export default function CheckoutForm({ totalVnd, onDone, onBack }) {
  const [form, setForm] = useState({ customerName: '', phone: '', email: '', address: '', couponCode: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const data = await apiFetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: { ...form, couponCode: form.couponCode || undefined, paymentMethod: 'cod' },
      })
      setOk(data)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  if (ok) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-3xl font-bold text-paper">ĐẶT HÀNG THÀNH CÔNG</p>
      <p className="text-sm text-paper/60">Mã đơn hàng của bạn:</p>
      <p className="font-display text-2xl font-bold tracking-widest text-accent">{ok.refCode}</p>
      <p className="text-sm text-paper/60">
        Tổng tiền: <span className="text-paper">{ok.totalVnd.toLocaleString('vi-VN')}₫</span>
        {ok.discountVnd > 0 && <> (đã giảm {ok.discountVnd.toLocaleString('vi-VN')}₫)</>}
      </p>
      <p className="max-w-xs text-xs text-paper/40">Thanh toán khi nhận hàng (COD). Dùng mã trên để tra cứu đơn.</p>
      <button onClick={onDone} className="mt-2 w-full bg-paper py-3 text-sm font-bold tracking-widest text-ink transition-colors hover:bg-accent">
        TIẾP TỤC MUA SẮM
      </button>
    </div>
  )

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h3 className="font-display text-xl font-bold text-paper">THANH TOÁN<span className="text-accent">.</span></h3>

      <div>
        <label className={labelCls} htmlFor="ck-name">HỌ VÀ TÊN</label>
        <input id="ck-name" required minLength={2} className={inputCls} value={form.customerName} onChange={set('customerName')} autoComplete="name" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="ck-phone">SĐT</label>
          <input id="ck-phone" required className={inputCls} value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ck-email">EMAIL</label>
          <input id="ck-email" required type="email" className={inputCls} value={form.email} onChange={set('email')} autoComplete="email" />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="ck-addr">ĐỊA CHỈ GIAO HÀNG</label>
        <textarea id="ck-addr" required minLength={8} rows={2} className={inputCls} value={form.address} onChange={set('address')} autoComplete="street-address" />
      </div>
      <div>
        <label className={labelCls} htmlFor="ck-coupon">MÃ GIẢM GIÁ (TÙY CHỌN)</label>
        <input id="ck-coupon" className={inputCls} value={form.couponCode} onChange={set('couponCode')} placeholder="WELCOME10" />
      </div>
      <div>
        <label className={labelCls}>PHƯƠNG THỨC</label>
        <p className="border border-accent/40 bg-ink-deep px-3 py-2.5 text-sm text-paper/80">
          Thanh toán khi nhận hàng (COD)
        </p>
      </div>

      {err && <p className="text-xs text-accent" role="alert">{err}</p>}

      <div className="mt-auto flex flex-col gap-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm tracking-widest text-paper/70">TỔNG (chưa trừ giảm giá)</span>
          <span className="font-display text-xl font-bold text-paper">{totalVnd.toLocaleString('vi-VN')}₫</span>
        </div>
        <button type="submit" disabled={busy} className="w-full bg-accent py-4 font-display text-sm font-bold tracking-widest text-ink transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? 'ĐANG XỬ LÝ…' : 'HOÀN TẤT ĐẶT HÀNG'}
        </button>
        <button type="button" onClick={onBack} className="text-xs tracking-widest text-paper/50 transition-colors hover:text-accent">
          ← QUAY LẠI GIỎ
        </button>
      </div>
    </form>
  )
}
