import { useEffect, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useCart } from '../store/CartContext.jsx'
import { useProfile } from '../store/profile.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed.js'
import { matchScore } from '../lib/match.js'
import { track } from '../lib/track.js'
import { RelatedProducts, RecentlyViewed } from './RelatedProducts.jsx'
import Reviews from './Reviews.jsx'
import { playTechClick, playSwitch } from '../lib/sound.js'

function ShoeArt({ colors, large }) {
  const w = large ? 'w-full max-w-xl' : 'w-full'
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${w} p-8`}
      style={{ background: `color-mix(in oklab, ${colors[0]} 30%, var(--color-charcoal-2))` }}
    >
      <svg viewBox="0 0 520 220" className={`${large ? 'w-[95%]' : 'w-[80%]'} opacity-95 drop-shadow-[0_20px_40px_rgba(0,0,0,0.7)]`} aria-hidden="true">
        <path d="M20 170 Q10 190 40 195 L480 195 Q510 190 505 165 L470 150 L60 150 Q30 155 20 170Z" fill={colors[0] === '#e8e6e1' ? '#0a0a0a' : colors[0]} />
        <path d="M60 150 Q80 60 200 55 Q300 50 350 90 L420 80 Q470 90 470 150 L60 150Z" fill="#e8e6e1" opacity="0.95" />
        <path d="M60 150 Q150 120 470 150 L460 160 Q160 130 60 150Z" fill={colors[1] || '#0a0a0a'} opacity="0.9" />
        <path d="M200 55 Q300 50 350 90 L370 95 Q320 60 210 60Z" fill="#18181b" />
        <line x1="240" y1="70" x2="280" y2="100" stroke="#09090b" strokeWidth="5" strokeLinecap="round" />
        <line x1="270" y1="65" x2="310" y2="95" stroke="#09090b" strokeWidth="5" strokeLinecap="round" />
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
  const [photoIdx, setPhotoIdx] = useState(0)
  const [photoOk, setPhotoOk] = useState(true)
  const [sizeHelper, setSizeHelper] = useState(false)
  const [otherBrand, setOtherBrand] = useState('NIKE')

  useEffect(() => { setSize(null); setMsg(null); setPhotoIdx(0); setPhotoOk(true) }, [slug])
  const tracked = useRef(null)
  const { wishlist, toggle: toggleWishlist } = useWishlist()
  const { items: recent, push: pushRecent } = useRecentlyViewed(slug)
  useEffect(() => {
    if (p && tracked.current !== p.id) {
      tracked.current = p.id
      track('view', p.id)
      pushRecent({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, price: p.price, price_vnd: p.price_vnd, colors: p.colors, tags: p.tags, tag: p.tag, purpose: p.purpose })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p])

  if (error) return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-accent font-mono">KHÔNG TÌM THẤY SẢN PHẨM.</p>
    </main>
  )
  if (!p) return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm font-mono tracking-widest text-paper/50">ĐANG TẢI DỮ LIỆU SNEAKER…</p>
    </main>
  )

  const inStock = (v) => v.stock > 0
  const match = matchScore(profile, p)

  const onAdd = async () => {
    if (!size) {
      setMsg('Vui lòng chọn size trước khi thêm.')
      playTechClick()
      return
    }
    setAdding(true)
    playSwitch()
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
    <main className="mx-auto max-w-7xl px-4 pt-24 pb-28 md:px-8 md:pt-32">
      {/* Back button */}
      <button
        onClick={back}
        className="group mb-8 flex items-center gap-2 font-mono text-xs font-semibold tracking-widest text-paper/60 transition-colors duration-200 hover:text-accent"
      >
        <span className="transition-transform group-hover:-translate-x-1">←</span>
        TRỞ VỀ BỘ SẢN PHẨM
      </button>

      <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
        {/* Left column: Visual Gallery */}
        <div className="flex flex-col gap-4">
          <div className="border border-white/10 bg-charcoal overflow-hidden relative">
            {p.images?.length > 0 && photoOk ? (
              <img
                key={photoIdx}
                src={p.images[photoIdx] ?? p.images[0]}
                alt={p.name}
                onError={() => setPhotoOk(false)}
                className="aspect-[4/3] w-full object-cover animate-fadeIn"
              />
            ) : (
              <ShoeArt colors={p.colors} large />
            )}
            {p.tag && (
              <span className="absolute top-4 left-4 bg-accent px-3 py-1 font-mono text-xs font-bold text-ink">
                {p.tag}
              </span>
            )}
          </div>
          {p.images?.length > 1 && photoOk && (
            <div className="flex gap-2">
              {p.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => { setPhotoIdx(i); setPhotoOk(true); playTechClick() }}
                  aria-label={`Xem ảnh ${i + 1}`}
                  className={`h-16 w-20 overflow-hidden border transition-all ${i === photoIdx ? 'border-accent' : 'border-white/15 opacity-60 hover:opacity-100'}`}
                >
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Guarantees row */}
          <div className="grid grid-cols-3 gap-2 border border-white/10 bg-charcoal-2/40 p-4 font-mono text-[10px] text-paper/60">
            <div className="flex flex-col items-center text-center gap-1">
              <span className="text-accent font-bold">2H EXPRESS</span>
              <span>Giao hỏa tốc nội thành</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1 border-x border-white/10 px-2">
              <span className="text-accent font-bold">30 NGÀY</span>
              <span>Đổi size miễn phí</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1">
              <span className="text-accent font-bold">100% AUTH</span>
              <span>Hoàn 200% nếu fake</span>
            </div>
          </div>
        </div>

        {/* Right column: Info, Sizing, CTA */}
        <div className="flex flex-col gap-6">
          <div>
            <span className="font-mono text-xs tracking-widest text-accent font-semibold">{p.brand}</span>
            <h1 className="display-l mt-1 text-paper">{p.name}</h1>
            <p className="mt-2 font-display text-2xl font-bold text-accent">{p.price}</p>
            {(() => {
              const total = p.variants.reduce((s, v) => s + v.stock, 0)
              if (total <= 0) return <p className="mt-2 font-mono text-xs font-bold text-paper/60">HẾT HÀNG TẠM THỜI</p>
              if (total <= 5) return <p className="mt-2 font-mono text-xs font-bold text-accent">🔥 CHỈ CÒN {total} ĐÔI — NHANH TAY</p>
              return null
            })()}
          </div>

          {/* Colorway Pills */}
          <div>
            <span className="font-mono text-[10px] tracking-widest text-paper/50">PHỐI MÀU GỐC:</span>
            <div className="mt-2 flex items-center gap-2">
              {p.colors.map((c) => (
                <span
                  key={c}
                  className="h-6 w-6 rounded-full border border-white/30 shadow-inner"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <p className="text-sm leading-relaxed text-paper/70 font-sans">{p.description}</p>

          {/* Size Selector */}
          <fieldset className="flex flex-col gap-3 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between">
              <legend className="font-mono text-xs font-semibold tracking-widest text-paper/80">
                CHỌN SIZE (EU)
              </legend>
              <button
                type="button"
                onClick={() => setSizeHelper(!sizeHelper)}
                className="font-mono text-[11px] text-accent underline hover:text-accent-hot"
              >
                {sizeHelper ? 'ẨN TƯ VẤN SIZE' : 'HƯỚNG DẪN CHỌN SIZE ?'}
              </button>
            </div>

            {/* Interactive Size Helper Box */}
            {sizeHelper && (
              <div className="border border-white/15 bg-charcoal-2 p-3 font-mono text-xs text-paper/70 animate-fadeIn">
                <p className="font-bold text-paper mb-2">ĐỀ XUẤT SIZE KINETIC:</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-paper/50">BẠN HAY MANG GIÀY:</span>
                  <select
                    value={otherBrand}
                    onChange={(e) => setOtherBrand(e.target.value)}
                    className="bg-ink border border-white/20 px-2 py-0.5 text-xs text-paper"
                  >
                    <option value="NIKE">Nike</option>
                    <option value="ADIDAS">Adidas</option>
                    <option value="NB">New Balance</option>
                    <option value="ASICS">Asics</option>
                  </select>
                </div>
                <p className="text-[11px] text-accent">
                  → Phom dáng KINETIC thiết kế chuẩn True To Size so với {otherBrand}. Hãy chọn size bạn hay đi nhất.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    if (inStock(v)) {
                      setSize(v)
                      setMsg(null)
                      playTechClick()
                    }
                  }}
                  disabled={!inStock(v)}
                  aria-pressed={size?.id === v.id}
                  className={`h-11 w-14 border font-mono text-sm font-semibold transition-all duration-150 ${
                    !inStock(v)
                      ? 'cursor-not-allowed border-white/5 text-paper/20 line-through'
                      : size?.id === v.id
                      ? 'border-accent bg-accent text-ink font-bold shadow-[0_0_15px_rgba(212,58,42,0.4)]'
                      : 'border-white/15 text-paper/80 hover:border-accent hover:text-accent'
                  }`}
                >
                  {v.size}
                </button>
              ))}
            </div>
            <p className="font-mono text-[11px] text-paper/40">
              Gạch ngang = hết hàng.
              {size && size.stock <= 3 && <> Size {size.size} chỉ còn {size.stock} đôi.</>}
            </p>
          </fieldset>

          {/* Add to Bag CTA */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onAdd}
              disabled={adding}
              className="w-full border border-accent bg-accent py-4 font-display text-sm font-bold tracking-widest text-ink transition-all duration-200 hover:bg-transparent hover:text-accent disabled:opacity-50"
            >
              {adding ? 'ĐANG THÊM VÀO GIỎ…' : size ? `THÊM SIZE ${size.size} VÀO GIỎ HÀNG` : 'CHỌN SIZE ĐỂ ĐẶT HÀNG'}
            </button>
            {msg && <p className="font-mono text-xs text-accent" role="alert">{msg}</p>}
          </div>

          {/* Match & Performance Breakdown */}
          {p.perf != null && (
            <section aria-label="Why this shoe" className="border-t border-white/10 pt-6">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs font-semibold tracking-widest text-paper/70 uppercase">
                  WHY THIS SHOE?
                </span>
                {match && (
                  <p className="font-display text-2xl font-bold text-accent">
                    {match.pct}%
                    <span className="ml-1 font-mono text-[10px] font-normal tracking-widest text-paper/50">
                      MATCH SCORE
                    </span>
                  </p>
                )}
              </div>

              {match?.reasons?.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 font-mono text-xs text-paper/60">
                  {match.reasons.map((r) => <li key={r}>// {r}</li>)}
                </ul>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {[
                  ['PERFORMANCE', p.perf],
                  ['COMFORT', p.comfort],
                  ['STYLING', p.style],
                  ['DURABILITY', p.durability],
                  ['DAILY USE', p.daily],
                ].map(([label, v]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 font-mono text-[10px] tracking-widest text-paper/50">{label}</span>
                    <span className="h-1.5 flex-1 bg-charcoal-2 rounded-full overflow-hidden">
                      <span className="block h-full bg-accent" style={{ width: `${v ?? 0}%` }} />
                    </span>
                    <span className="w-8 text-right font-mono text-[10px] text-paper/40">{v ?? '—'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Meta specs */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/10 pt-4 font-mono text-xs text-paper/50">
            {p.collection_name && (
              <div className="flex justify-between gap-4"><dt>COLLECTION</dt><dd className="text-paper/80 font-bold">{p.collection_name}</dd></div>
            )}
            <div className="flex justify-between gap-4"><dt>STATUS</dt><dd className="text-accent font-bold">{p.tag || 'ACTIVE'}</dd></div>
            <div className="flex justify-between gap-4"><dt>PURPOSE</dt><dd className="text-paper/80 uppercase">{p.purpose || 'ALL'}</dd></div>
            <div className="flex justify-between gap-4"><dt>MATERIAL</dt><dd className="text-paper/80">Ripstop + TPU</dd></div>
          </dl>
        </div>
      </div>

      <Reviews slug={slug} />

      <RelatedProducts current={p} wishlist={wishlist} onWishlist={toggleWishlist} />
      <RecentlyViewed items={recent} wishlist={wishlist} onWishlist={toggleWishlist} />

      {/* Sticky Mobile Bar for quick add */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-charcoal/95 p-3 backdrop-blur-md md:hidden flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-3">
          <p className="truncate font-display text-xs font-bold text-paper">{p.name}</p>
          <p className="font-mono text-xs font-bold text-accent">{p.price}</p>
        </div>
        <button
          onClick={onAdd}
          disabled={adding}
          className="border border-accent bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent"
        >
          {size ? `MUA SIZE ${size.size}` : 'CHỌN SIZE'}
        </button>
      </div>
    </main>
  )
}
