import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { useCart } from '../store/CartContext.jsx'
import { matchScore, sortProducts } from '../lib/match.js'
import { playTechClick } from '../lib/sound.js'

// Cache variants tránh fetch lặp lại khi hover nhiều lần
const variantCache = new Map()

export function Card({ p, match, onWishlist, isWishlisted, onToggleCompare, isCompared }) {
  const { add, open: openCart } = useCart()
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [variants, setVariants] = useState([])
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [addedMsg, setAddedMsg] = useState(null)
  const [activeColorIdx, setActiveColorIdx] = useState(0)

  const spanCls =
    p.span === 'wide' ? 'md:col-span-2 aspect-[2.2/1]' :
    p.span === 'tall' ? 'md:row-span-2 aspect-[1/2.1]' :
    'aspect-square'

  const activeColor = p.colors[activeColorIdx] || p.colors[0]

  // Tải variants khi người dùng hover/mở quick add
  const loadVariants = async () => {
    if (variantCache.has(p.slug)) {
      setVariants(variantCache.get(p.slug))
      return
    }
    setLoadingVariants(true)
    try {
      const res = await fetch(`/api/v1/products/${p.slug}`)
      const data = await res.json()
      if (data.success && data.data?.variants) {
        variantCache.set(p.slug, data.data.variants)
        setVariants(data.data.variants)
      }
    } catch {
      // fallback nếu server offline
    } finally {
      setLoadingVariants(false)
    }
  }

  const handleQuickAdd = async (variant, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (variant.stock <= 0) return

    playTechClick()
    try {
      await add(variant.id)
      setAddedMsg(`ĐÃ THÊM SIZE ${variant.size}`)
      setTimeout(() => setAddedMsg(null), 2000)
    } catch {
      setAddedMsg('LỖI THÊM VÀO GIỎ')
      setTimeout(() => setAddedMsg(null), 2000)
    }
  }

  return (
    <div
      onMouseEnter={() => {
        setShowQuickAdd(true)
        loadVariants()
      }}
      onMouseLeave={() => setShowQuickAdd(false)}
      className={`group relative flex flex-col border border-white/10 bg-charcoal transition-all duration-300 hover:border-accent hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${spanCls} min-w-0 overflow-hidden`}
    >
      {/* Background Graphic & Sneaker Silhouette */}
      <a
        href={`#/san-pham/${p.slug}`}
        className="relative flex flex-1 items-center justify-center overflow-hidden transition-transform duration-500 group-hover:scale-[1.04]"
        style={{ background: `color-mix(in oklab, ${activeColor} 25%, var(--color-charcoal-2))` }}
      >
        {/* Subtle grid background */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] bg-[size:1rem_1rem]" />

        <svg viewBox="0 0 520 220" className="w-[82%] drop-shadow-[0_15px_25px_rgba(0,0,0,0.6)]" aria-hidden="true">
          {/* Sole */}
          <path
            d="M20 170 Q10 190 40 195 L480 195 Q510 190 505 165 L470 150 L60 150 Q30 155 20 170Z"
            fill={activeColor === '#e8e6e1' ? '#0a0a0a' : activeColor}
          />
          {/* Upper body */}
          <path d="M60 150 Q80 60 200 55 Q300 50 350 90 L420 80 Q470 90 470 150 L60 150Z" fill="#e8e6e1" opacity="0.92" />
          {/* Accent Swoosh Slash */}
          <path d="M60 150 Q150 120 470 150 L460 160 Q160 130 60 150Z" fill={activeColor} opacity="0.9" />
          {/* Midsole line detail */}
          <path d="M120 160 Q260 140 440 160" stroke="#18181b" strokeWidth="3" fill="none" opacity="0.4" />
        </svg>

        {/* Quick Added Notification Banner */}
        {addedMsg && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-accent py-2 text-center text-xs font-bold tracking-widest text-ink shadow-lg animate-fadeIn">
            {addedMsg}
          </div>
        )}
      </a>

      {/* Badges: Tag, Match & Wishlist */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        {p.tag && (
          <span className="bg-accent px-2 py-0.5 text-[10px] font-bold tracking-widest text-ink">
            {p.tag}
          </span>
        )}
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {match != null && (
          <span className="border border-accent/60 bg-ink/85 px-2 py-0.5 font-mono text-[10px] tracking-widest text-accent backdrop-blur-sm">
            {match}% MATCH
          </span>
        )}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleCompare?.(p)
            playTechClick()
          }}
          aria-label={isCompared ? 'Bỏ so sánh' : 'So sánh thông số'}
          title={isCompared ? 'Bỏ so sánh' : 'So sánh thông số'}
          className={`flex h-7 px-2 items-center justify-center rounded-full border backdrop-blur-md text-[10px] font-mono transition-all ${
            isCompared
              ? 'border-accent bg-accent text-ink font-bold'
              : 'border-white/20 bg-ink/60 text-paper/70 hover:border-white hover:text-paper'
          }`}
        >
          {isCompared ? '✓ SO SÁNH' : '+ SO SÁNH'}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onWishlist?.(p.id)
            playTechClick()
          }}
          aria-label={isWishlisted ? 'Bỏ thích' : 'Yêu thích'}
          className={`flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-md transition-all ${
            isWishlisted
              ? 'border-accent bg-accent text-ink'
              : 'border-white/20 bg-ink/60 text-paper/70 hover:border-white hover:text-paper'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </button>
      </div>

      {/* Quick Size Selector Slider on Hover */}
      <div
        className={`absolute inset-x-0 bottom-[61px] z-20 border-t border-white/10 bg-charcoal-2/95 px-3 py-2 backdrop-blur-md transition-all duration-300 ${
          showQuickAdd ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between mb-1 text-[10px] font-mono tracking-wider text-paper/60">
          <span>CHỌN SIZE MUA NHANH:</span>
          {loadingVariants && <span>ĐANG TẢI...</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(variants.length > 0 ? variants : [39, 40, 41, 42, 43, 44].map((s) => ({ id: `temp-${s}`, size: s, stock: 10 }))).map((v) => (
            <button
              key={v.id}
              disabled={v.stock <= 0}
              onClick={(e) => handleQuickAdd(v, e)}
              className={`rounded border px-2 py-1 text-[11px] font-mono font-bold transition-all ${
                v.stock <= 0
                  ? 'border-white/10 text-paper/20 cursor-not-allowed line-through'
                  : 'border-white/20 text-paper hover:border-accent hover:bg-accent hover:text-ink'
              }`}
            >
              {v.size}
            </button>
          ))}
        </div>
      </div>

      {/* Info row */}
      <div className="relative z-10 flex items-end justify-between gap-3 border-t border-white/10 bg-charcoal px-4 py-3">
        <a href={`#/san-pham/${p.slug}`} className="min-w-0 flex-1 group-hover:text-accent">
          <p className="text-[10px] font-mono tracking-widest text-paper/50">{p.brand}</p>
          <h3 className="truncate font-display text-sm font-semibold text-paper group-hover:text-accent transition-colors">
            {p.name}
          </h3>
          <p className="text-sm font-semibold text-accent">{p.price}</p>
        </a>

        {/* Color Dots with Quick Preview on Click/Hover */}
        <div className="flex shrink-0 gap-1.5" aria-label="Màu sắc">
          {p.colors.map((c, i) => (
            <button
              key={c}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setActiveColorIdx(i)
                playTechClick()
              }}
              aria-label={`Màu ${i + 1}`}
              className={`h-3 w-3 rounded-full border transition-transform ${
                activeColorIdx === i ? 'scale-125 border-accent ring-1 ring-accent' : 'border-white/30 hover:scale-110'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const BRANDS = ['TẤT CẢ', 'KINETIC', 'NIKE', 'ADIDAS', 'NEW BALANCE', 'ASICS', 'PUMA']
const PURPOSES = [
  { id: 'all', label: 'TẤT CẢ' },
  { id: 'running', label: 'CHẠY BỘ' },
  { id: 'street', label: 'STREETWEAR' },
  { id: 'court', label: 'BÓNG RỔ' },
  { id: 'daily', label: 'HẰNG NGÀY' },
  { id: 'trail', label: 'TRAIL / NÚI' },
]

export default function ProductGrid({ onToggleCompare, compareIds = [] }) {
  const ref = useRef(null)
  const { data: products, error } = useApi('/products?limit=100')
  const { profile } = useProfile()

  const [selectedBrand, setSelectedBrand] = useState('TẤT CẢ')
  const [selectedPurpose, setSelectedPurpose] = useState('all')
  const [sortBy, setSortBy] = useState('match')
  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kinetic_wishlist') || '[]')
    } catch {
      return []
    }
  })

  const toggleWishlist = (id) => {
    setWishlist((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try {
        localStorage.setItem('kinetic_wishlist', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Filter & Sort
  const filtered = useMemo(() => {
    let list = products || []
    if (selectedBrand !== 'TẤT CẢ') {
      list = list.filter((p) => p.brand.toUpperCase() === selectedBrand)
    }
    if (selectedPurpose !== 'all') {
      list = list.filter((p) => p.purpose === selectedPurpose)
    }

    if (sortBy === 'match') {
      return sortProducts(profile, list)
    } else if (sortBy === 'price-asc') {
      return [...list].sort((a, b) => a.price_vnd - b.price_vnd)
    } else if (sortBy === 'price-desc') {
      return [...list].sort((a, b) => b.price_vnd - a.price_vnd)
    } else if (sortBy === 'new') {
      return [...list].sort((a, b) => (b.tag === 'NEW' ? 1 : 0) - (a.tag === 'NEW' ? 1 : 0))
    }
    return list
  }, [products, profile, selectedBrand, selectedPurpose, sortBy])

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.1 },
    )
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  return (
    <section id="shop" ref={ref} className="reveal mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
      {/* Section Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            CATALOG // SS26
          </span>
          <h2 className="display-l text-paper mt-1">
            {profile ? 'DÀNH CHO BẠN' : 'BỘ SẢN PHẨM'}
          </h2>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-paper/60">
          <span>{filtered.length} SẢN PHẨM KHẢ DỤNG</span>
        </div>
      </div>

      {/* Filter & Sort Bar */}
      <div className="mb-10 flex flex-col gap-4 border-y border-white/10 py-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest text-paper/40 mr-1">HÃNG:</span>
          {BRANDS.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1 text-xs font-mono font-semibold tracking-wider transition-all ${
                selectedBrand === b
                  ? 'border border-accent bg-accent text-ink'
                  : 'border border-white/10 bg-charcoal text-paper/60 hover:border-white/30 hover:text-paper'
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Purpose & Sort Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-paper/40">MỤC ĐÍCH:</span>
            <select
              value={selectedPurpose}
              onChange={(e) => setSelectedPurpose(e.target.value)}
              className="border border-white/15 bg-charcoal px-3 py-1 text-xs font-mono text-paper focus:border-accent focus:outline-none"
            >
              {PURPOSES.map((p) => (
                <option key={p.id} value={p.id} className="bg-charcoal text-paper">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-paper/40">SẮP XẾP:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-white/15 bg-charcoal px-3 py-1 text-xs font-mono text-paper focus:border-accent focus:outline-none"
            >
              <option value="match" className="bg-charcoal text-paper">PHÙ HỢP NHẤT</option>
              <option value="price-asc" className="bg-charcoal text-paper">GIÁ: THẤP ĐẾN CAO</option>
              <option value="price-desc" className="bg-charcoal text-paper">GIÁ: CAO ĐẾN THẤP</option>
              <option value="new" className="bg-charcoal text-paper">MỚI NHẤT</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-accent mb-6">
          Không tải được sản phẩm — kiểm tra server backend.
        </p>
      )}

      {/* Asymmetric Product Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {filtered.map((p) => (
          <Card
            key={p.id}
            p={p}
            match={profile && matchScore(profile, p)?.pct}
            onWishlist={toggleWishlist}
            isWishlisted={wishlist.includes(p.id)}
            onToggleCompare={onToggleCompare}
            isCompared={compareIds.includes(p.id)}
          />
        ))}
      </div>
    </section>
  )
}
