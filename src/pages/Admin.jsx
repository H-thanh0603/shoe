import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiGet } from '../lib/api.js'
import { playTechClick } from '../lib/sound.js'
import AdminChat from '../components/AdminChat.jsx'

// Mirror server NEXT (routes/admin.js) — action khả dụng cho mỗi status
const NEXT = { pending: ['paid', 'cancelled'], paid: ['shipped', 'cancelled'], shipped: ['done', 'cancelled'], done: [], cancelled: [] }
const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫'
const th = 'px-3 py-2 text-left font-mono text-[10px] tracking-widest text-paper/50'
const td = 'px-3 py-2 text-sm text-paper/80'
const btn = 'border border-white/15 px-2.5 py-1 font-mono text-[11px] text-paper/70 hover:border-accent hover:text-accent disabled:opacity-40'
const inputCls = 'border border-white/15 bg-ink-deep px-2.5 py-1.5 text-sm text-paper placeholder:text-paper/30 focus:border-accent focus:outline-none'

function Stat({ label, value, accent }) {
  return (
    <div className="border border-white/10 bg-charcoal p-4">
      <p className="font-mono text-[10px] tracking-widest text-paper/50">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${accent ? 'text-accent' : 'text-paper'}`}>{value}</p>
    </div>
  )
}

function Dashboard() {
  const [a, setA] = useState(null)
  const [e, setE] = useState(null)
  useEffect(() => {
    apiGet('/admin/analytics').then(setA).catch(() => {})
    apiGet('/admin/analytics/events').then(setE).catch(() => {})
  }, [])
  if (!a) return <p className="font-mono text-xs text-paper/50">ĐANG TẢI SỐ LIỆU…</p>
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="DOANH THU" value={vnd(a.revenue)} accent />
        <Stat label="ĐƠN (TRỪ HỦY)" value={a.orders} />
        <Stat label="AOV" value={vnd(a.aov)} />
        <Stat label="CHỜ XỬ LÝ" value={a.pendingOrders} accent={a.pendingOrders > 0} />
        <Stat label="KHÁCH HÀNG" value={a.customers} />
      </div>

      {e && (
        <div className="border border-white/10 bg-charcoal p-4">
          <p className="font-mono text-[10px] tracking-widest text-paper/50">HÀNH VI 30 NGÀY — {e.funnel.sessions} PHIÊN</p>
          <p className="mt-2 font-mono text-xs text-paper/70">
            XEM {e.funnel.views} → GIỎ {e.funnel.carts} → TỈ LỆ <span className="font-bold text-accent">{e.funnel.viewToCart}%</span>
            {' '}· QUIZ {e.funnel.quizzes}
          </p>
          {e.topViews.length > 0 && (
            <table className="mt-3 w-full border-collapse">
              <thead><tr className="border-b border-white/10"><th className={th}>SẢN PHẨM</th><th className={th}>XEM</th><th className={th}>VÀO GIỎ</th></tr></thead>
              <tbody>
                {e.topViews.map((r) => (
                  <tr key={r.slug} className="border-b border-white/5">
                    <td className={td}><a className="hover:text-accent" href={`#/san-pham/${r.slug}`}>{r.name}</a></td>
                    <td className={td}>{r.views}</td>
                    <td className={td}>{r.carts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border border-white/10 bg-charcoal p-4">
          <p className="font-mono text-[10px] tracking-widest text-paper/50">TOP DOANH THU</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {a.topProducts.map((t) => (
              <li key={t.name} className="flex justify-between gap-3 text-sm"><span className="text-paper/80">{t.name} <span className="font-mono text-xs text-paper/40">x{t.qty}</span></span><span className="font-mono text-accent">{vnd(t.revenue)}</span></li>
            ))}
          </ul>
        </div>
        <div className="border border-white/10 bg-charcoal p-4">
          <p className="font-mono text-[10px] tracking-widest text-paper/50">SẮP HẾT HÀNG (≤3)</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {a.lowStock.length === 0 && <li className="text-sm text-paper/40">Kho ổn.</li>}
            {a.lowStock.map((v) => (
              <li key={v.id} className="flex justify-between gap-3 text-sm"><span className="text-paper/80">{v.name} <span className="font-mono text-xs text-paper/40">size {v.size}</span></span><span className={`font-mono font-bold ${v.stock <= 0 ? 'text-paper/40' : 'text-accent'}`}>{v.stock}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Orders() {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const load = useCallback(() => {
    apiGet(`/admin/orders?limit=20${status ? `&status=${status}` : ''}`).then((d) => setRows(d.items || d)).catch(() => {})
  }, [status])
  useEffect(load, [load])

  const transit = async (id, next) => {
    if (!confirm(`Chuyển đơn #${id} → ${next}?`)) return
    try {
      await apiFetch(`/admin/orders/${id}`, { method: 'PATCH', body: { status: next } })
      playTechClick(); load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {['', 'pending', 'paid', 'shipped', 'done', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1 font-mono text-xs ${status === s ? 'bg-accent font-bold text-ink' : 'border border-white/15 text-paper/60 hover:text-paper'}`}>
            {s || 'TẤT CẢ'}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full border-collapse bg-charcoal">
          <thead><tr className="border-b border-white/10"><th className={th}>MÃ</th><th className={th}>KHÁCH</th><th className={th}>TỔNG</th><th className={th}>TRẠNG THÁI</th><th className={th}>THAO TÁC</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-white/5">
                <td className={td}><span className="font-mono font-bold text-paper">{o.ref_code}</span> <span className="font-mono text-[11px] text-paper/40">({o.item_count} món)</span></td>
                <td className={td}>{o.customer_name}</td>
                <td className={td}>{vnd(o.total_vnd)}</td>
                <td className={td}><span className="font-mono text-xs text-accent">{o.status}</span></td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1.5">
                    {(NEXT[o.status] || []).map((n) => (
                      <button key={n} onClick={() => transit(o.id, n)} className={btn}>→ {n}</button>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Products() {
  const [rows, setRows] = useState([])
  const [variants, setVariants] = useState(null) // { name, list }
  const [adjust, setAdjust] = useState({})
  const load = useCallback(() => {
    apiGet('/admin/products').then(setRows).catch(() => {})
  }, [])
  useEffect(load, [load])

  const toggleActive = async (p) => {
    await apiFetch(`/admin/products/${p.id}/${p.is_active ? 'archive' : 'restore'}`, { method: 'PATCH' }).catch((e) => alert(e.message))
    load()
  }
  const openVariants = async (p) => {
    const list = await apiGet(`/admin/products/${p.id}/variants`).catch(() => [])
    setVariants({ id: p.id, name: p.name, list })
  }
  const restock = async (v) => {
    const qty = Number(adjust[v.id])
    if (!qty) return
    try {
      await apiFetch('/admin/inventory', { method: 'POST', body: { variantId: v.id, qty } })
      setAdjust((a) => ({ ...a, [v.id]: '' }))
      openVariants({ id: variants.id, name: variants.name })
      load()
    } catch (e) { alert(e.message) }
  }

  const [editing, setEditing] = useState(null) // null | {…fields} | {id,…fields}
  const blankForm = { name: '', slug: '', brand: 'KINETIC', description: '', priceVnd: '', colors: '#d43a2a,#0a0a0a', tag: '', purpose: 'daily', sizes: '39,40,41,42,43,44', stockEach: '10' }

  const saveProduct = async (e) => {
    e.preventDefault()
    const body = {
      name: editing.name.trim(),
      slug: editing.slug.trim().toLowerCase(),
      brand: editing.brand.trim(),
      description: editing.description.trim() || undefined,
      priceVnd: Number(editing.priceVnd),
      colors: editing.colors.split(',').map((c) => c.trim()).filter(Boolean),
      tag: editing.tag || null,
      purpose: editing.purpose || null,
    }
    try {
      if (editing.id) {
        await apiFetch(`/admin/products/${editing.id}`, { method: 'PATCH', body })
      } else {
        // tạo mới bắt buộc kèm sizes + tồn (không variants = hàng chết)
        const sizes = editing.sizes.split(',').map((s) => Number(s.trim())).filter((s) => s >= 30 && s <= 50)
        if (!sizes.length) { alert('Nhập ít nhất 1 size (30–50), cách nhau bằng phẩy.'); return }
        const stock = Math.max(0, Number(editing.stockEach) || 0)
        body.variants = sizes.map((size) => ({ size, stock }))
        await apiFetch('/admin/products', { method: 'POST', body })
      }
      setEditing(null); playTechClick(); load()
    } catch (err) { alert(err.message) }
  }
  const fset = (k) => (e) => setEditing((f) => ({ ...f, [k]: e.target.value }))
  const labelCls = 'flex flex-col gap-1 font-mono text-[10px] text-paper/50'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button onClick={() => setEditing({ ...blankForm })} className="border border-accent bg-accent px-4 py-1.5 font-mono text-xs font-bold text-ink hover:bg-transparent hover:text-accent">+ THÊM SẢN PHẨM</button>
      </div>

      {editing && (
        <form onSubmit={saveProduct} className="flex flex-wrap items-end gap-2 border border-accent/40 bg-charcoal p-4">
          <label className={labelCls}>TÊN*<input value={editing.name} onChange={fset('name')} required minLength={2} className={`${inputCls} w-48`} /></label>
          <label className={labelCls}>SLUG*<input value={editing.slug} onChange={fset('slug')} required pattern="[a-z0-9-]+" placeholder="ten-giay-01" disabled={!!editing.id} className={`${inputCls} w-40`} /></label>
          <label className={labelCls}>HÃNG*<input value={editing.brand} onChange={fset('brand')} required className={`${inputCls} w-32`} /></label>
          <label className={labelCls}>GIÁ (VND)*<input value={editing.priceVnd} onChange={fset('priceVnd')} required inputMode="numeric" className={`${inputCls} w-32`} /></label>
          <label className={labelCls}>MÀU (hex, phẩy)<input value={editing.colors} onChange={fset('colors')} className={`${inputCls} w-48`} /></label>
          <label className={labelCls}>TAG
            <select value={editing.tag} onChange={fset('tag')} className={inputCls}>
              <option value="">—</option><option value="NEW">NEW</option><option value="LIMITED">LIMITED</option><option value="SALE">SALE</option>
            </select>
          </label>
          <label className={labelCls}>MỤC ĐÍCH
            <select value={editing.purpose} onChange={fset('purpose')} className={inputCls}>
              <option value="">—</option><option value="running">CHẠY BỘ</option><option value="street">STREET</option><option value="court">BÓNG RỔ</option><option value="daily">HẰNG NGÀY</option><option value="trail">TRAIL</option>
            </select>
          </label>
          {!editing.id && (
            <>
              <label className={labelCls}>SIZES* (phẩy)<input value={editing.sizes} onChange={fset('sizes')} required placeholder="39,40,41,42,43,44" className={`${inputCls} w-48`} /></label>
              <label className={labelCls}>TỒN MỖI SIZE*<input value={editing.stockEach} onChange={fset('stockEach')} required inputMode="numeric" className={`${inputCls} w-24`} /></label>
            </>
          )}
          {editing.id && (
            <p className="font-mono text-[11px] text-paper/40 basis-full">Sửa tồn từng size ở nút KHO ngoài bảng — form này chỉ sửa thông tin.</p>
          )}
          <label className={`${labelCls} basis-full`}>MÔ TẢ<textarea value={editing.description} onChange={fset('description')} rows={2} className={inputCls} /></label>
          <button type="submit" className="border border-accent bg-accent px-4 py-1.5 font-mono text-xs font-bold text-ink hover:bg-transparent hover:text-accent">{editing.id ? 'LƯU' : 'TẠO'}</button>
          <button type="button" onClick={() => setEditing(null)} className={btn}>HỦY</button>
        </form>
      )}

      <div className="overflow-x-auto border border-white/10">
        <table className="w-full border-collapse bg-charcoal">
          <thead><tr className="border-b border-white/10"><th className={th}>SẢN PHẨM</th><th className={th}>GIÁ</th><th className={th}>TỒN</th><th className={th}>HIỂN THỊ</th><th className={th}>THAO TÁC</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`border-b border-white/5 ${p.is_active ? '' : 'opacity-50'}`}>
                <td className={td}><span className="font-bold text-paper">{p.name}</span> <span className="font-mono text-[11px] text-paper/40">{p.brand} · {p.slug}</span></td>
                <td className={td}>{vnd(p.price_vnd)}</td>
                <td className={td}>{Number(p.total_stock)}</td>
                <td className={td}>{p.is_active ? 'BẬT' : 'ẨN'}</td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1.5">
                    <button onClick={() => openVariants(p)} className={btn}>KHO</button>
                    <button
                      onClick={() => setEditing({
                        id: p.id, name: p.name, slug: p.slug, brand: p.brand,
                        description: p.description || '', priceVnd: String(p.price_vnd),
                        colors: (Array.isArray(p.colors) ? p.colors : JSON.parse(p.colors || '[]')).join(','),
                        tag: p.tag || '', purpose: p.purpose || '',
                      })}
                      className={btn}
                    >
                      SỬA
                    </button>
                    <button onClick={() => toggleActive(p)} className={btn}>{p.is_active ? 'ẨN' : 'HIỆN'}</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {variants && (
        <div className="border border-accent/40 bg-charcoal p-4">
          <p className="font-mono text-xs font-bold tracking-widest text-paper">KHO — {variants.name}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {variants.list.map((v) => (
              <li key={v.id} className="flex items-center gap-3 text-sm">
                <span className="w-20 font-mono text-paper/80">size {v.size}</span>
                <span className={`w-12 font-mono font-bold ${v.stock <= 3 ? 'text-accent' : 'text-paper'}`}>{v.stock}</span>
                <input
                  value={adjust[v.id] || ''}
                  onChange={(e) => setAdjust((a) => ({ ...a, [v.id]: e.target.value }))}
                  placeholder="+5 / −2"
                  inputMode="numeric"
                  className={`${inputCls} w-24`}
                />
                <button onClick={() => restock(v)} className={btn}>NHẬP/XUẤT</button>
              </li>
            ))}
          </ul>
          <button onClick={() => setVariants(null)} className="mt-3 font-mono text-xs text-paper/50 hover:text-paper">ĐÓNG ✕</button>
        </div>
      )}
    </div>
  )
}

function Coupons() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ code: '', type: 'PERCENTAGE', value: '10', minimumOrderVnd: '0', usageLimit: '', expiresAt: '' })
  const load = useCallback(() => {
    apiGet('/admin/coupons').then(setRows).catch(() => {})
  }, [])
  useEffect(load, [load])

  const create = async (e) => {
    e.preventDefault()
    try {
      await apiFetch('/admin/coupons', {
        method: 'POST',
        body: {
          code: form.code, type: form.type, value: Number(form.value),
          minimumOrderVnd: Number(form.minimumOrderVnd) || 0,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        },
      })
      setForm({ code: '', type: 'PERCENTAGE', value: '10', minimumOrderVnd: '0', usageLimit: '', expiresAt: '' })
      playTechClick(); load()
    } catch (err) { alert(err.message) }
  }

  const toggle = async (c) => {
    await apiFetch(`/admin/coupons/${c.id}`, {
      method: 'PATCH', body: { status: c.status === 'active' ? 'inactive' : 'active' },
    }).catch((e) => alert(e.message))
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 border border-white/10 bg-charcoal p-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">MÃ<input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} required minLength={3} placeholder="SALE20" className={`${inputCls} w-32`} /></label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">LOẠI
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={`${inputCls}`}>
            <option value="PERCENTAGE">% PHẦN TRĂM</option>
            <option value="FIXED">TIỀN CỐ ĐỊNH</option>
            <option value="FREE_SHIPPING">FREESHIP</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">GIÁ TRỊ<input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} required inputMode="numeric" className={`${inputCls} w-24`} /></label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">ĐƠN TỐI THIỂU<input value={form.minimumOrderVnd} onChange={(e) => setForm((f) => ({ ...f, minimumOrderVnd: e.target.value }))} inputMode="numeric" className={`${inputCls} w-32`} /></label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">GIỚI HẠN LƯỢT<input value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} placeholder="∞" inputMode="numeric" className={`${inputCls} w-24`} /></label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">HẾT HẠN<input value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} type="date" className={`${inputCls}`} /></label>
        <button type="submit" className="border border-accent bg-accent px-4 py-1.5 font-mono text-xs font-bold text-ink hover:bg-transparent hover:text-accent">+ TẠO MÃ</button>
      </form>

      <div className="overflow-x-auto border border-white/10">
        <table className="w-full border-collapse bg-charcoal">
          <thead><tr className="border-b border-white/10"><th className={th}>MÃ</th><th className={th}>LOẠI</th><th className={th}>GIÁ TRỊ</th><th className={th}>ĐÃ DÙNG</th><th className={th}>TRẠNG THÁI</th><th className={th}></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={`border-b border-white/5 ${c.status === 'active' ? '' : 'opacity-50'}`}>
                <td className={`${td} font-mono font-bold text-paper`}>{c.code}</td>
                <td className={td}>{c.type}</td>
                <td className={td}>{c.type === 'PERCENTAGE' ? `${c.value}%` : c.type === 'FIXED' ? vnd(c.value) : 'FREESHIP'}</td>
                <td className={td}>{c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ''}</td>
                <td className={td}>{c.status}</td>
                <td className={td}><button onClick={() => toggle(c)} className={btn}>{c.status === 'active' ? 'TẮT' : 'BẬT'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChangeApprovals() {
  const [rows, setRows] = useState([])
  const load = useCallback(() => {
    apiGet('/admin/agent-changes?status=staged').then(setRows).catch(() => {})
  }, [])
  useEffect(load, [load])

  const act = async (id, op) => {
    if (op === 'approve' && !confirm(`Duyệt ${id}? Agent sẽ được apply.`)) return
    try {
      if (op === 'approve') await apiFetch(`/admin/agent-changes/${id}/approve`, { method: 'POST', body: { approved: true } })
      else await apiFetch(`/admin/agent-changes/${id}/discard`, { method: 'POST' })
      playTechClick(); load()
    } catch (e) { alert(e.message) }
  }

  if (!rows.length) return <p className="font-mono text-xs text-paper/50">Không có change nào chờ duyệt.</p>
  return (
    <div className="flex flex-col gap-3">
      {rows.map((c) => (
        <div key={c.change_id} className="border border-white/10 bg-charcoal p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-sm font-bold text-paper">{c.change_id} <span className="text-[11px] font-normal text-paper/50">[{c.kind}] · bởi {c.created_by || '?'} · {new Date(c.created_at).toLocaleString('vi-VN')}</span></p>
            <span className="flex gap-1.5">
              <button onClick={() => act(c.change_id, 'approve')} className="border border-accent bg-accent px-3 py-1 font-mono text-[11px] font-bold text-ink hover:bg-transparent hover:text-accent">DUYỆT</button>
              <button onClick={() => act(c.change_id, 'discard')} className={btn}>BỎ</button>
            </span>
          </div>
          <p className="mt-1 text-sm text-paper/80">{c.summary}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {(c.items || []).map((it, i) => (
              <li key={i} className="font-mono text-xs text-paper/60">
                {it.target} · {it.field}: {JSON.stringify(it.before)} → {JSON.stringify(it.after)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Roles() {
  const [roles, setRoles] = useState([])
  const [allPerms, setAllPerms] = useState([])
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null) // role id đang sửa quyền
  const [checked, setChecked] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState({ name: '', description: '' })
  const [userRoles, setUserRoles] = useState({}) // userId -> string[] (bản nháp)

  const load = useCallback(() => {
    apiGet('/admin/roles').then(setRoles).catch((e) => alert(e.message))
    apiGet('/admin/permissions').then(setAllPerms).catch(() => {})
  }, [])
  useEffect(load, [load])
  const loadUsers = useCallback(() => {
    apiGet(`/admin/users?limit=20${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
      .then((d) => {
        setUsers(d.items || d)
        const draft = {}
        for (const u of (d.items || d)) draft[u.id] = u.roles || []
        setUserRoles(draft)
      })
      .catch(() => {})
  }, [q])
  useEffect(loadUsers, [loadUsers])

  const permDesc = Object.fromEntries(allPerms.map((p) => [p.key, p.description || p.key]))
  const selRole = roles.find((r) => r.id === sel)
  useEffect(() => {
    setChecked(new Set(selRole?.permissions || []))
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePerm = (key) => setChecked((s) => {
    const n = new Set(s)
    if (n.has(key)) n.delete(key)
    else n.add(key)
    return n
  })

  const savePerms = async () => {
    if (!selRole) return
    setSaving(true)
    try {
      await apiFetch(`/admin/roles/${selRole.id}/permissions`, { method: 'PUT', body: { permissionKeys: [...checked] } })
      playTechClick(); load()
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  const createRole = async (e) => {
    e.preventDefault()
    try {
      await apiFetch('/admin/roles', { method: 'POST', body: { name: creating.name.trim().toLowerCase(), description: creating.description.trim() } })
      setCreating({ name: '', description: '' }); playTechClick(); load()
    } catch (err) { alert(err.message) }
  }

  const deleteRole = async (r) => {
    if (!confirm(`Xóa role "${r.name}"? (chỉ xóa được khi hết member)`)) return
    try {
      await apiFetch(`/admin/roles/${r.id}`, { method: 'DELETE' })
      if (sel === r.id) setSel(null)
      playTechClick(); load()
    } catch (e) { alert(e.message) }
  }

  const toggleUserRole = (uid, roleName) => setUserRoles((m) => {
    const cur = new Set(m[uid] || [])
    if (cur.has(roleName)) cur.delete(roleName)
    else cur.add(roleName)
    return { ...m, [uid]: [...cur] }
  })

  const saveUserRoles = async (u) => {
    try {
      await apiFetch(`/admin/users/${u.id}/roles`, { method: 'POST', body: { roleNames: userRoles[u.id] || [] } })
      playTechClick(); loadUsers()
    } catch (e) { alert(e.message) }
  }

  // nhóm quyền theo tiền tố (orders, products, ...) cho dễ nhìn
  const groups = {}
  for (const p of allPerms) {
    const [ns] = p.key.split(':')
    ;(groups[ns] ??= []).push(p)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-white/10 bg-charcoal p-4">
        <p className="font-mono text-[10px] tracking-widest text-paper/50">VAI TRÒ ({roles.length})</p>
        <form onSubmit={createRole} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">TÊN* (slug)<input value={creating.name} onChange={(e) => setCreating((c) => ({ ...c, name: e.target.value }))} required pattern="[a-z0-9-]+" placeholder="kho-hcm" className={`${inputCls} w-36`} /></label>
          <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">MÔ TẢ<input value={creating.description} onChange={(e) => setCreating((c) => ({ ...c, description: e.target.value }))} placeholder="Thủ kho chi nhánh HCM" className={`${inputCls} w-64`} /></label>
          <button type="submit" className="border border-accent bg-accent px-4 py-1.5 font-mono text-xs font-bold text-ink hover:bg-transparent hover:text-accent">+ TẠO ROLE</button>
        </form>
        <table className="mt-3 w-full border-collapse">
          <thead><tr className="border-b border-white/10"><th className={th}>ROLE</th><th className={th}>MEMBER</th><th className={th}>QUYỀN</th><th className={th}></th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className={`border-b border-white/5 ${sel === r.id ? 'bg-accent/5' : ''}`}>
                <td className={td}><span className="font-mono font-bold text-paper">{r.name}</span> <span className="text-[11px] text-paper/40">{r.description}</span></td>
                <td className={td}>{Number(r.members)}</td>
                <td className={td}><span className="font-mono text-[11px] text-paper/60">{(r.permissions || []).join(', ') || '—'}</span></td>
                <td className={td}>
                  <span className="flex gap-1.5">
                    <button onClick={() => setSel(r.id)} className={btn}>SỬA QUYỀN</button>
                    <button onClick={() => deleteRole(r)} className={btn}>XÓA</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selRole && (
        <div className="border border-accent/40 bg-charcoal p-4">
          <p className="font-mono text-xs font-bold tracking-widest text-paper">QUYỀN — {selRole.name} <span className="font-normal text-paper/40">({checked.size} đã chọn)</span></p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {Object.entries(groups).map(([ns, list]) => (
              <div key={ns} className="border border-white/10 p-3">
                <p className="font-mono text-[10px] tracking-widest text-accent">{ns.toUpperCase()}</p>
                {list.map((p) => (
                  <label key={p.key} className="mt-1.5 flex cursor-pointer items-start gap-2 text-sm text-paper/80 hover:text-paper">
                    <input type="checkbox" checked={checked.has(p.key)} onChange={() => togglePerm(p.key)} className="mt-1 accent-[#d43a2a]" />
                    <span><span className="font-mono text-xs font-bold">{p.key}</span> <span className="text-xs text-paper/50">— {p.description}</span></span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={savePerms} disabled={saving} className="border border-accent bg-accent px-4 py-1.5 font-mono text-xs font-bold text-ink hover:bg-transparent hover:text-accent disabled:opacity-40">LƯU QUYỀN</button>
            <button onClick={() => setSel(null)} className={btn}>ĐÓNG</button>
          </div>
        </div>
      )}

      <div className="border border-white/10 bg-charcoal p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] tracking-widest text-paper/50">GÁN VAI TRÒ CHO USER</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm email/tên…" className={`${inputCls} w-56`} />
        </div>
        <table className="mt-3 w-full border-collapse">
          <thead><tr className="border-b border-white/10"><th className={th}>USER</th><th className={th}>VAI TRÒ</th><th className={th}></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5">
                <td className={td}><span className="font-bold text-paper">{u.email}</span> <span className="text-[11px] text-paper/40">{u.name} · {u.role}</span></td>
                <td className={td}>
                  <span className="flex flex-wrap gap-2">
                    {roles.map((r) => (
                      <label key={r.id} className="flex cursor-pointer items-center gap-1 font-mono text-[11px] text-paper/70 hover:text-paper">
                        <input type="checkbox" checked={(userRoles[u.id] || []).includes(r.name)} onChange={() => toggleUserRole(u.id, r.name)} className="accent-[#d43a2a]" />
                        {r.name}
                      </label>
                    ))}
                  </span>
                </td>
                <td className={td}><button onClick={() => saveUserRoles(u)} className={btn}>LƯU</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AuditLog() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 })
  const [f, setF] = useState({ action: '', entity: '', actorId: '' })
  const [page, setPage] = useState(1)
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ limit: 20, page })
    if (f.action.trim()) qs.set('action', f.action.trim())
    if (f.entity.trim()) qs.set('entity', f.entity.trim())
    if (f.actorId.trim()) qs.set('actorId', f.actorId.trim())
    try {
      const d = await apiFetch(`/admin/audit-logs?${qs}`, { method: 'GET' })
      setRows(d.items || d)
      setMeta({ page: d.meta?.page || 1, totalPages: d.meta?.totalPages || 1 })
    } catch (e) { alert(e.message) }
  }, [f.action, f.entity, f.actorId, page])
  useEffect(load, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 border border-white/10 bg-charcoal p-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">ACTION<input value={f.action} onChange={(e) => setF((s) => ({ ...s, action: e.target.value }))} placeholder="user.roles" className={`${inputCls} w-40`} /></label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">ENTITY<input value={f.entity} onChange={(e) => setF((s) => ({ ...s, entity: e.target.value }))} placeholder="order" className={`${inputCls} w-32`} /></label>
        <label className="flex flex-col gap-1 font-mono text-[10px] text-paper/50">ACTOR ID<input value={f.actorId} onChange={(e) => setF((s) => ({ ...s, actorId: e.target.value }))} inputMode="numeric" className={`${inputCls} w-24`} /></label>
        <button onClick={() => { setPage(1); load() }} className="border border-accent bg-accent px-4 py-1.5 font-mono text-xs font-bold text-ink hover:bg-transparent hover:text-accent">LỌC</button>
      </div>
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full border-collapse bg-charcoal">
          <thead><tr className="border-b border-white/10"><th className={th}>THỜI GIAN</th><th className={th}>AI</th><th className={th}>ACTION</th><th className={th}>ĐỐI TƯỢNG</th><th className={th}>CHI TIẾT</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-white/5">
                <td className={`${td} font-mono text-[11px]`}>{new Date(a.created_at).toLocaleString('vi-VN')}</td>
                <td className={td}>{a.actor_email || `#${a.actor_id ?? '?'}`}</td>
                <td className={`${td} font-mono text-xs text-accent`}>{a.action}</td>
                <td className={td}>{a.entity}{a.entity_id ? `:${a.entity_id}` : ''}</td>
                <td className={`${td} max-w-xs truncate font-mono text-[11px] text-paper/50`} title={JSON.stringify(a.meta)}>{JSON.stringify(a.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={btn}>← TRƯỚC</button>
        <span className="font-mono text-xs text-paper/50">TRANG {meta.page}/{meta.totalPages}</span>
        <button disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} className={btn}>SAU →</button>
      </div>
    </div>
  )
}

// Mỗi tab yêu cầu 1 quyền — staff chỉ thấy tab mình có quyền
const TABS = [
  ['dash', 'TỔNG QUAN', 'analytics:read'],
  ['orders', 'ĐƠN HÀNG', 'orders:read'],
  ['products', 'SẢN PHẨM', 'products:read'],
  ['coupons', 'MÃ GIẢM GIÁ', 'coupons:read'],
  ['changes', 'DUYỆT CHANGE', 'agent:read'],
  ['chat', 'TRỢ LÝ', 'agent:use'],
  ['roles', 'PHÂN QUYỀN', 'users:manage'],
  ['audit', 'NHẬT KÝ', 'audit:read'],
]

export default function Admin() {
  const [me, setMe] = useState(null)
  const [perms, setPerms] = useState([])
  const [checked, setChecked] = useState(false)
  const [tab, setTab] = useState('dash')

  useEffect(() => {
    Promise.all([apiGet('/auth/me').catch(() => null), apiGet('/admin/me/permissions').catch(() => null)])
      .then(([u, p]) => { setMe(u); setPerms(p?.permissions || []) })
      .finally(() => setChecked(true))
  }, [])

  const can = (perm) => me?.role === 'admin' || perms.includes(perm)
  const visibleTabs = TABS.filter(([, , perm]) => can(perm))
  useEffect(() => {
    if (checked && visibleTabs.length && !visibleTabs.some(([id]) => id === tab)) setTab(visibleTabs[0][0])
  }, [checked]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) return <main className="mx-auto max-w-6xl px-4 pt-24 pb-28 md:pt-32"><p className="font-mono text-xs text-paper/50">ĐANG KIỂM TRA QUYỀN…</p></main>
  if (!me || visibleTabs.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:pt-32">
        <p className="font-mono text-xs tracking-widest text-accent">ADMIN //</p>
        <h1 className="display-l mt-1 text-paper">KHÔNG CÓ QUYỀN<span className="text-accent">.</span></h1>
        <p className="mt-4 text-sm text-paper/60">Tài khoản của bạn chưa được gán vai trò quản trị nào. Liên hệ admin để được phân quyền.</p>
        <a href="#" className="mt-6 inline-block border border-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-accent hover:bg-accent hover:text-ink">VỀ TRANG CHỦ</a>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-24 pb-28 md:px-8 md:pt-32">
      <p className="font-mono text-xs tracking-widest text-accent">ADMIN // {me.email}</p>
      <h1 className="display-l mt-1 text-paper">QUẢN TRỊ<span className="text-accent">.</span></h1>

      <div className="mt-8 mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {visibleTabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); playTechClick() }}
            className={`px-4 py-1.5 font-mono text-xs font-bold tracking-widest ${tab === id ? 'bg-accent text-ink' : 'border border-white/15 text-paper/60 hover:text-paper'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dash' && <Dashboard />}
      {tab === 'orders' && <Orders />}
      {tab === 'products' && <Products />}
      {tab === 'coupons' && <Coupons />}
      {tab === 'chat' && <AdminChat />}
      {tab === 'changes' && <ChangeApprovals />}
      {tab === 'roles' && <Roles />}
      {tab === 'audit' && <AuditLog />}
    </main>
  )
}
