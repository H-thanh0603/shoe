import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { useCart } from '../store/CartContext.jsx'
import { matchScore, sortProducts } from '../lib/match.js'
import { playTechClick, playSwitch } from '../lib/sound.js'

// Cache variants tránh fetch lặp lại khi hover nhiều lần
const variantCache = new Map()

export function Card({ p, match, onWishlist, isWishlisted, onToggleCompare, isCompared }) {
  const { add } = useCart()
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
      // fallback
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

      {/* Badges: Tag, Match, Compare & Wishlist */}
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
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
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
  { id: 'all', label: 'TẤT CẢ MỤC ĐÍCH' },
  { id: 'running', label: 'CHẠY BỘ' },
  { id: 'street', label: 'STREETWEAR' },
  { id: 'court', label: 'BÓNG RỔ' },
  { id: 'daily', label: 'HẰNG NGÀY' },
  { id: 'trail', label: 'TRAIL / NÚI' },
]

const PRICE_RANGES = [
  { id: 'all', label: 'TẤT CẢ MỨC GIÁ' },
  { id: 'under-2.5m', label: 'DƯỚI 2.500.000₫', max: 2500000 },
  { id: '2.5m-4m', label: '2.500.000₫ – 4.000.000₫', min: 2500000, max: 4000000 },
  { id: 'above-4m', label: 'TRÊN 4.000.000₫', min: 4000000 },
]

const QUICK_SEARCH_CHIPS = ['KINETIC', 'AIR VECTOR', 'RUNNING', 'CARBON', 'SALE', 'NEW']

export default function ProductGrid({ onToggleCompare, compareIds = [] }) {
  const ref = useRef(null)
  const { data: products, error } = useApi('/products?limit=100')
  const { profile } = useProfile()

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('TẤT CẢ')
  const [selectedPurpose, setSelectedPurpose] = useState('all')
  const [selectedPrice, setSelectedPrice] = useState('all')
  const [onlyNew, setOnlyNew] = useState(false)
  const [sortBy, setSortBy] = useState('match')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(9) // 9 items per page (3x3 grid)

  // Wishlist state
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

  // Reset filters
  const resetFilters = () => {
    setSearchQuery('')
    setSelectedBrand('TẤT CẢ')
    setSelectedPurpose('all')
    setSelectedPrice('all')
    setOnlyNew(false)
    setSortBy('match')
    setCurrentPage(1)
    playTechClick()
  }

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedBrand !== 'TẤT CẢ' ||
    selectedPurpose !== 'all' ||
    selectedPrice !== 'all' ||
    onlyNew

  // Filtering & Sorting
  const filtered = useMemo(() => {
    let list = products || []

    // 1. Search Query filter (name, brand, description, tags)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((p) => {
        const inName = p.name?.toLowerCase().includes(q)
        const inBrand = p.brand?.toLowerCase().includes(q)
        const inDesc = p.description?.toLowerCase().includes(q)
        const inPurpose = p.purpose?.toLowerCase().includes(q)
        const inTags = p.tags?.some((t) => t.toLowerCase().includes(q))
        return inName || inBrand || inDesc || inPurpose || inTags
      })
    }

    // 2. Brand filter
    if (selectedBrand !== 'TẤT CẢ') {
      list = list.filter((p) => p.brand.toUpperCase() === selectedBrand)
    }

    // 3. Purpose filter
    if (selectedPurpose !== 'all') {
      list = list.filter((p) => p.purpose === selectedPurpose)
    }

    // 4. Price range filter
    if (selectedPrice !== 'all') {
      const pr = PRICE_RANGES.find((r) => r.id === selectedPrice)
      if (pr) {
        if (pr.min != null) list = list.filter((p) => p.price_vnd >= pr.min)
        if (pr.max != null) list = list.filter((p) => p.price_vnd <= pr.max)
      }
    }

    // 5. Only New Drop
    if (onlyNew) {
      list = list.filter((p) => p.tag === 'NEW' || p.tag === 'LIMITED')
    }

    // 6. Sorting
    if (sortBy === 'match') {
      return sortProducts(profile, list)
    } else if (sortBy === 'price-asc') {
      return [...list].sort((a, b) => a.price_vnd - b.price_vnd)
    } else if (sortBy === 'price-desc') {
      return [...list].sort((a, b) => b.price_vnd - a.price_vnd)
    } else if (sortBy === 'new') {
      return [...list].sort((a, b) => (b.tag === 'NEW' ? 1 : 0) - (a.tag === 'NEW' ? 1 : 0))
    } else if (sortBy === 'name-asc') {
      return [...list].sort((a, b) => a.name.localeCompare(b.name))
    }

    return list
  }, [products, profile, searchQuery, selectedBrand, selectedPurpose, selectedPrice, onlyNew, sortBy])

  // Pagination calculation
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Reset to page 1 if current page exceeds total pages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  // Current page items slice
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    playSwitch()
    // Scroll mượt lên đầu danh sách sản phẩm
    if (ref.current) {
      const topOffset = ref.current.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: topOffset, behavior: 'smooth' })
    }
  }

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
            CATALOG // SS26 ARCHIVE
          </span>
          <h2 className="display-l text-paper mt-1">
            {profile ? 'DÀNH CHO BẠN' : 'BỘ SẢN PHẨM'}
          </h2>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-paper/60">
          <span>
            {totalItems > 0
              ? `HIỂN THỊ ${(currentPage - 1) * pageSize + 1} – ${Math.min(currentPage * pageSize, totalItems)} TRÊN ${totalItems} ĐÔI GIÀY`
              : '0 SẢN PHẨM'}
          </span>
        </div>
      </div>

      {/* --- THANH TÌM KIẾM TRỰC DIỆN (PROMINENT SEARCH BAR) --- */}
      <div className="mb-6">
        <div className="relative flex items-center border border-white/20 bg-charcoal focus-within:border-accent transition-colors">
          <svg
            className="ml-4 h-5 w-5 text-accent shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="TÌM SNEAKER THEO TÊN, THƯƠNG HIỆU, CÔNG NGHỆ (VIBRAM, CARBON, GORE-TEX)..."
            className="w-full bg-transparent px-4 py-3.5 font-mono text-xs uppercase tracking-wider text-paper placeholder:text-paper/30 focus:outline-none md:text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setCurrentPage(1)
                playTechClick()
              }}
              className="mr-3 font-mono text-xs text-paper/50 hover:text-paper px-2 py-1"
            >
              XÓA ✕
            </button>
          )}
        </div>

        {/* Quick Search Chips */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest text-paper/40">GỢI Ý TÌM NHANH:</span>
          {QUICK_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setSearchQuery(chip)
                setCurrentPage(1)
                playTechClick()
              }}
              className={`font-mono text-[11px] px-2 py-0.5 border rounded-sm transition-all ${
                searchQuery.toUpperCase() === chip
                  ? 'border-accent bg-accent text-ink font-bold'
                  : 'border-white/10 text-paper/60 hover:border-accent hover:text-accent'
              }`}
            >
              #{chip}
            </button>
          ))}
        </div>
      </div>

      {/* --- THANH BỘ LỌC ĐA TIÊU CHÍ (MULTI-CRITERIA FILTERS) --- */}
      <div className="mb-8 flex flex-col gap-4 border-y border-white/10 py-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest text-paper/40 mr-1">HÃNG:</span>
          {BRANDS.map((b) => (
            <button
              key={b}
              onClick={() => {
                setSelectedBrand(b)
                setCurrentPage(1)
                playTechClick()
              }}
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

        {/* Dropdown Filters & Sorts */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mục đích */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-paper/40">MỤC ĐÍCH:</span>
            <select
              value={selectedPurpose}
              onChange={(e) => {
                setSelectedPurpose(e.target.value)
                setCurrentPage(1)
              }}
              className="border border-white/15 bg-charcoal px-3 py-1 text-xs font-mono text-paper focus:border-accent focus:outline-none"
            >
              {PURPOSES.map((p) => (
                <option key={p.id} value={p.id} className="bg-charcoal text-paper">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mức giá */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-paper/40">GIÁ:</span>
            <select
              value={selectedPrice}
              onChange={(e) => {
                setSelectedPrice(e.target.value)
                setCurrentPage(1)
              }}
              className="border border-white/15 bg-charcoal px-3 py-1 text-xs font-mono text-paper focus:border-accent focus:outline-none"
            >
              {PRICE_RANGES.map((r) => (
                <option key={r.id} value={r.id} className="bg-charcoal text-paper">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sắp xếp */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-paper/40">SẮP XẾP:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setCurrentPage(1)
              }}
              className="border border-white/15 bg-charcoal px-3 py-1 text-xs font-mono text-paper focus:border-accent focus:outline-none"
            >
              <option value="match" className="bg-charcoal text-paper">PHÙ HỢP NHẤT</option>
              <option value="price-asc" className="bg-charcoal text-paper">GIÁ: THẤP ĐẾN CAO</option>
              <option value="price-desc" className="bg-charcoal text-paper">GIÁ: CAO ĐẾN THẤP</option>
              <option value="new" className="bg-charcoal text-paper">MỚI NHẤT</option>
              <option value="name-asc" className="bg-charcoal text-paper">TÊN: A → Z</option>
            </select>
          </div>

          {/* Toggle New / Limited */}
          <button
            onClick={() => {
              setOnlyNew(!onlyNew)
              setCurrentPage(1)
              playTechClick()
            }}
            className={`border px-3 py-1 text-xs font-mono font-semibold transition-all ${
              onlyNew
                ? 'border-accent bg-accent text-ink'
                : 'border-white/15 bg-charcoal text-paper/60 hover:text-paper'
            }`}
          >
            {onlyNew ? '✓ NEW DROPS' : '+ NEW DROPS'}
          </button>

          {/* Nút Xóa toàn bộ bộ lọc */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-mono text-accent hover:bg-accent hover:text-ink transition-all"
            >
              ĐẶT LẠI BỘ LỌC ✕
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-accent mb-6">
          Không tải được sản phẩm — kiểm tra server backend.
        </p>
      )}

      {/* --- EMPTY STATE KHI KHÔNG TÌM THẤY --- */}
      {filtered.length === 0 && (
        <div className="my-16 flex flex-col items-center justify-center border border-dashed border-white/15 bg-charcoal/40 py-16 px-4 text-center">
          <svg className="h-12 w-12 text-accent/60 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-display text-lg font-bold text-paper">
            KHÔNG TÌM THẤY SẢN PHẨM PHÙ HỢP
          </h3>
          <p className="mt-2 max-w-md font-mono text-xs text-paper/50">
            Không có kết quả nào khớp với từ khóa &quot;{searchQuery}&quot; hoặc tiêu chí lọc hiện tại.
          </p>
          <button
            onClick={resetFilters}
            className="mt-6 border border-accent bg-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent transition-all"
          >
            ĐẶT LẠI TẤT CẢ BỘ LỌC
          </button>
        </div>
      )}

      {/* --- PRODUCT GRID (Hiển thị các sản phẩm trên trang hiện tại) --- */}
      {paginatedItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {paginatedItems.map((p) => (
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
      )}

      {/* --- THANH PHÂN TRANG HOÀN CHỈNH (PAGINATION BAR) --- */}
      {totalPages > 1 && (
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row">
          {/* Thông tin số lượng & Items Per Page */}
          <div className="flex items-center gap-4 font-mono text-xs text-paper/60">
            <span>
              TRANG <strong className="text-paper">{currentPage}</strong> / {totalPages}
            </span>
            <span className="text-white/20">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-paper/40">MỖI TRANG:</span>
              {[6, 9, 12, 18].map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setPageSize(size)
                    setCurrentPage(1)
                    playTechClick()
                  }}
                  className={`px-2 py-0.5 border text-[11px] font-mono transition-all ${
                    pageSize === size
                      ? 'border-accent bg-accent text-ink font-bold'
                      : 'border-white/15 text-paper/60 hover:text-paper'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Page Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Nút Trước */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="border border-white/15 px-3 py-2 font-mono text-xs font-bold tracking-wider text-paper/80 transition-all hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:text-paper/80"
            >
              ← TRƯỚC
            </button>

            {/* Danh sách các số trang */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`h-9 w-9 border font-mono text-xs font-bold transition-all ${
                  currentPage === pageNum
                    ? 'border-accent bg-accent text-ink shadow-[0_0_12px_rgba(212,58,42,0.4)]'
                    : 'border-white/15 text-paper/70 hover:border-accent hover:text-accent'
                }`}
              >
                {pageNum}
              </button>
            ))}

            {/* Nút Tiếp */}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border border-white/15 px-3 py-2 font-mono text-xs font-bold tracking-wider text-paper/80 transition-all hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:text-paper/80"
            >
              TIẾP →
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
