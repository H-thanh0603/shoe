import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api.js'
import { playTechClick } from '../lib/sound.js'

const QUICK_TAGS = [
  { label: 'AIR VECTOR 01', q: 'air vector' },
  { label: 'CHẠY BỘ', q: 'running' },
  { label: 'STREET', q: 'street' },
  { label: 'GORE-TEX / NƯỚC', q: 'water-resistant' },
  { label: 'CARBON', q: 'carbon' },
  { label: 'LIMITED DROP', q: 'limited' },
]

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  // Auto focus khi mở
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActiveIndex(0)
      playTechClick()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Lắng nghe Escape để đóng
  useEffect(() => {
    const onKey = (e) => {
      if (!open) return
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(results.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault()
        location.hash = `#/san-pham/${results[activeIndex].slug}`
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, activeIndex, onClose])

  // Debounced query
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await apiGet(`/products?q=${encodeURIComponent(query.trim())}&limit=8`)
        setResults(data || [])
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/80 pt-20 backdrop-blur-md px-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-white/20 bg-charcoal shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Input Field */}
        <div className="relative flex items-center border-b border-white/10 px-4 py-3">
          <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="TÌM SNEAKER, THƯƠNG HIỆU, CÔNG NGHỆ, MỤC ĐÍCH..."
            className="flex-1 bg-transparent font-display text-sm uppercase tracking-wider text-paper placeholder:text-paper/30 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="font-mono text-xs text-paper/40 hover:text-paper px-2"
            >
              XÓA
            </button>
          )}
          <span className="ml-2 border border-white/15 px-2 py-0.5 font-mono text-[10px] text-paper/40">
            ESC
          </span>
        </div>

        {/* Quick Tag Pills */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-charcoal-2/50 px-4 py-2.5">
          <span className="font-mono text-[10px] tracking-widest text-paper/40">GỢI Ý:</span>
          {QUICK_TAGS.map((t) => (
            <button
              key={t.label}
              onClick={() => setQuery(t.q)}
              className="rounded-sm border border-white/10 px-2 py-0.5 text-[11px] font-mono text-paper/70 hover:border-accent hover:text-accent transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Results Body */}
        <div className="max-h-[380px] overflow-y-auto p-2">
          {loading && (
            <div className="py-8 text-center font-mono text-xs tracking-widest text-paper/40">
              ĐANG TÌM KIẾM TRONG KHO DỮ LIỆU...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-8 text-center font-mono text-xs text-paper/40">
              KHÔNG TÌM THẤY SẢN PHẨM PHÙ HỢP VỚI &quot;{query.toUpperCase()}&quot;
            </div>
          )}

          {!loading && !query && (
            <div className="py-6 px-4 text-center">
              <p className="font-mono text-xs tracking-widest text-paper/40">
                GÕ TỪ KHÓA ĐỂ TÌM KIẾM HOẶC DÙNG CÁC THẺ GỢI Ý PHÍA TRÊN
              </p>
              <div className="mt-3 flex justify-center gap-4 text-[11px] font-mono text-paper/30">
                <span>↑↓ DI CHUYỂN</span>
                <span>↵ CHỌN</span>
                <span>ESC ĐÓNG</span>
              </div>
            </div>
          )}

          {!loading && results.map((p, idx) => (
            <a
              key={p.id}
              href={`#/san-pham/${p.slug}`}
              onClick={onClose}
              className={`flex items-center justify-between border border-transparent p-3 transition-colors ${
                activeIndex === idx
                  ? 'border-accent/40 bg-white/5 text-paper'
                  : 'text-paper/80 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Mini thumbnail */}
                <div
                  className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden border border-white/10"
                  style={{ background: `color-mix(in oklab, ${p.colors[0]} 30%, var(--color-charcoal-2))` }}
                >
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <svg viewBox="0 0 520 220" className="w-10 opacity-90" aria-hidden="true">
                      <path d="M20 170 Q10 190 40 195 L480 195 Q510 190 505 165 L470 150 L60 150 Q30 155 20 170Z" fill={p.colors[0]} />
                      <path d="M60 150 Q80 60 200 55 Q300 50 350 90 L420 80 Q470 90 470 150 L60 150Z" fill="#e8e6e1" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[9px] tracking-widest text-paper/40">{p.brand}</p>
                  <p className="truncate font-display text-sm font-semibold text-paper">{p.name}</p>
                </div>
              </div>

              <div className="shrink-0 text-right ml-4">
                <span className="font-mono text-xs font-bold text-accent">{p.price}</span>
                {p.tag && (
                  <span className="ml-2 bg-accent/20 border border-accent/40 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                    {p.tag}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
