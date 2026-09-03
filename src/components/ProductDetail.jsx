import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useCart } from '../store/CartContext.jsx'
import { useProfile } from '../store/profile.js'
import { matchScore } from '../lib/match.js'

// ProductDetail (Bước 4) — dùng shape /api/v1/products/:slug:
// { ..., variants: [{ id, size, stock }], collection_slug/name }
function ShoeArt({ colors, large }) {
  const w = large ? 'w-full max-w-xl' : 'w-full'
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${w}`}
      style={{ background: `color-mix(in oklab, ${colors[0]} 30%, #16161a)` }}
    >
      <svg viewBox="0 0 520 220" className={`${large ? 'w-[92%]' : 'w-[80%]'} opacity-90`} aria-hidden="true">
        <path d="M20 170 Q10 190 40 195 L480 195 Q510 190 505 165 L470 150 L60 150 Q30 155 20 170Z" fill={colors[0] === '#e8e6e1' ? '#0a0a0a' : colors[0]} />
        <path d="M60 150 Q80 60 200 55 Q300 50 350 90 L420 80 Q470 90 470 150 L60 150Z" fill="#e8e6e1" opacity="0.9" />
        <path d="M60 150 Q150 120 470 150 L460 160 Q160 130 60 150Z" fill="#0a0a0a" opacity="0.85" />
      </svg>
    </div>
  )
}

export default function ProductDetail({ slug, back }) {
  const { data: p, error } = useApi(`/products/${slug}`)
  const { add, open: openCart } = useCart()
  const { profile } = useProfile()
  const [size, setSize] = useState(null)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { setSize(null); setMsg(null) }, [slug])

  if (error) return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-accent">Không tìm thấy sản phẩm.</p>
    </main>
  )
  if (!p) return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm tracking-widest text-paper/50">ĐANG TẢI…</p>
    </main>
  )

  const inStock = (v) => v.stock > 0
  const match = matchScore(profile, p)

  const onAdd = async () => {
    if (!size) { setMsg('Chọn size trước.'); return }
    setAdding(true)
    try {
      await add(size.id)
      openCart()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pt-24 pb-20 md:px-8 md:pt-32">
      <button onClick={back} className="mb-8 text-sm font-medium tracking-widest text-paper/60 transition-colors duration-200 hover:text-accent">
        ← TRỞ VỀ
      </button>

      <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
        <div className="border border-white/10 bg-charcoal">
          <ShoeArt colors={p.colors} large />
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <p className="text-[10px] tracking-widest text-paper/50">{p.brand}</p>
            <h1 className="display-l text-paper">{p.name}</h1>
            <p className="mt-2 text-2xl font-semibold text-accent">{p.price}</p>
          </div>

          <div className="flex items-center gap-2" aria-label="Màu sắc">
            {p.colors.map((c) => (
              <span key={c} className="h-5 w-5 rounded-full border border-white/30" style={{ background: c }} />
            ))}
          </div>

          <p className="max-w-md text-sm leading-relaxed text-paper/60">{p.description}</p>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-semibold tracking-widest text-paper/70">CHỌN SIZE</legend>
            <div className="flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => inStock(v) && setSize(v)}
                  disabled={!inStock(v)}
                  aria-pressed={size?.id === v.id}
                  className={`h-11 w-14 border text-sm font-medium transition-colors duration-150
                    ${!inStock(v) ? 'cursor-not-allowed border-white/5 text-paper/20 line-through'
                      : size?.id === v.id ? 'border-accent bg-accent font-bold text-ink'
                      : 'border-white/15 text-paper/80 hover:border-accent hover:text-accent'}`}
                >
                  {v.size}
                </button>
              ))}
            </div>
            <p className="text-xs text-paper/40">Gạch ngang = hết size. Số còn lại hiển thị ở giỏ nếu thiếu.</p>
          </fieldset>

          <div className="flex flex-col gap-2">
            <button
              onClick={onAdd}
              disabled={adding}
              className="w-full bg-paper px-6 py-4 text-sm font-bold tracking-widest text-ink transition-colors duration-200 hover:bg-accent disabled:opacity-50 md:max-w-xs"
            >
              {adding ? 'ĐANG THÊM…' : 'ADD TO BAG'}
            </button>
            {msg && <p className="text-xs text-accent" role="alert">{msg}</p>}
          </div>

          {p.perf != null && (
            <section aria-label="Why this shoe" className="border-t border-white/10 pt-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-semibold tracking-widest text-paper/70">WHY THIS SHOE?</h2>
                {match && (
                  <p className="font-display text-3xl font-bold text-accent">{match.pct}%<span className="ml-1 text-xs font-normal tracking-widest text-paper/50">MATCH</span></p>
                )}
              </div>
              {match?.reasons?.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1">
                  {match.reasons.map((r) => <li key={r} className="text-xs text-paper/60">— {r}</li>)}
                </ul>
              )}
              <div className="mt-4 flex flex-col gap-2">
                {[['PERFORMANCE', p.perf], ['COMFORT', p.comfort], ['FASHION', p.style], ['DURABILITY', p.durability], ['DAILY', p.daily]].map(([label, v]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 font-mono text-[10px] tracking-widest text-paper/50">{label}</span>
                    <span className="h-1.5 flex-1 bg-charcoal-2"><span className="block h-full bg-paper/60" style={{ width: `${v ?? 0}%` }} /></span>
                    <span className="w-8 text-right font-mono text-[10px] text-paper/40">{v ?? '—'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-xs text-paper/50">
            {p.collection_name && (
              <div className="flex justify-between gap-4"><dt>Collection</dt><dd className="text-paper/80">{p.collection_name}</dd></div>
            )}
            <div className="flex justify-between gap-4"><dt>Tag</dt><dd className="text-paper/80">{p.tag || '—'}</dd></div>
          </dl>
        </div>
      </div>
    </main>
  )
}
