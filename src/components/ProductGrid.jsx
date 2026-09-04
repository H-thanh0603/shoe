import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { useProductFilter, DEFAULT_FILTERS, hasActiveFilters } from '../hooks/useProductFilter.js'
import { matchScore } from '../lib/match.js'
import { playTechClick, playSwitch } from '../lib/sound.js'
import { Card } from './ProductCard.jsx'
import { SearchBar, FilterBar } from './ProductFilters.jsx'

const PAGE_SIZES = [6, 9, 12, 18]

export default function ProductGrid({ onToggleCompare, compareIds = [], preset = null, heading = null, kicker = null }) {
  const ref = useRef(null)
  const { data: products, error } = useApi('/products?limit=100')
  const { profile } = useProfile()
  const { wishlist, toggle: toggleWishlist } = useWishlist()

  const initial = useMemo(() => ({ ...DEFAULT_FILTERS, ...(preset || {}) }), [])
  const [filters, setFilters] = useState(initial)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(9)

  const patchFilters = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    if (patch.page !== undefined) setCurrentPage(patch.page)
    else if (patch.query !== undefined || patch.brand || patch.purpose || patch.price || patch.sortBy !== undefined || patch.onlyNew !== undefined) setCurrentPage(1)
  }

  const resetFilters = () => {
    setFilters(initial)
    setCurrentPage(1)
    playTechClick()
  }

  const filtered = useProductFilter(products, profile, filters)

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [totalPages, currentPage])

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    playSwitch()
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
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            {kicker || 'CATALOG // SS26 ARCHIVE'}
          </span>
          <h2 className="display-l text-paper mt-1">
            {heading || (profile ? 'DÀNH CHO BẠN' : 'BỘ SẢN PHẨM')}
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

      <SearchBar value={filters.query} onChange={(query) => patchFilters({ query })} />

      <FilterBar
        filters={filters}
        onChange={(next) => patchFilters(next)}
        hasActiveFilters={hasActiveFilters(filters)}
        onReset={resetFilters}
      />

      {error && (
        <p className="text-sm text-accent mb-6">
          Không tải được sản phẩm — kiểm tra server backend.
        </p>
      )}

      {filtered.length === 0 && (
        <div className="my-16 flex flex-col items-center justify-center border border-dashed border-white/15 bg-charcoal/40 py-16 px-4 text-center">
          <svg className="h-12 w-12 text-accent/60 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-display text-lg font-bold text-paper">
            KHÔNG TÌM THẤY SẢN PHẨM PHÙ HỢP
          </h3>
          <p className="mt-2 max-w-md font-mono text-xs text-paper/50">
            Không có kết quả nào khớp với từ khóa &quot;{filters.query}&quot; hoặc tiêu chí lọc hiện tại.
          </p>
          <button
            onClick={resetFilters}
            className="mt-6 border border-accent bg-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent transition-all"
          >
            ĐẶT LẠI TẤT CẢ BỘ LỌC
          </button>
        </div>
      )}

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

      {totalPages > 1 && (
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row">
          <div className="flex items-center gap-4 font-mono text-xs text-paper/60">
            <span>
              TRANG <strong className="text-paper">{currentPage}</strong> / {totalPages}
            </span>
            <span className="text-white/20">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-paper/40">MỖI TRANG:</span>
              {PAGE_SIZES.map((size) => (
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

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="border border-white/15 px-3 py-2 font-mono text-xs font-bold tracking-wider text-paper/80 transition-all hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:text-paper/80"
            >
              ← TRƯỚC
            </button>

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
