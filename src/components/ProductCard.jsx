import { useState } from 'react'
import { useCart } from '../store/CartContext.jsx'
import { useVariants } from '../hooks/useVariants.js'
import { playTechClick } from '../lib/sound.js'

const FALLBACK_SIZES = [39, 40, 41, 42, 43, 44].map((s) => ({ id: `temp-${s}`, size: s, stock: 10 }))

export function Card({ p, match, onWishlist, isWishlisted, onToggleCompare, isCompared }) {
  const { add } = useCart()
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const { variants, loading: loadingVariants, load: loadVariants } = useVariants(p.slug)
  const [addedMsg, setAddedMsg] = useState(null)
  const [activeColorIdx, setActiveColorIdx] = useState(0)

  const spanCls =
    p.span === 'wide' ? 'md:col-span-2 aspect-[2.2/1]' :
    p.span === 'tall' ? 'md:row-span-2 aspect-[1/2.1]' :
    'aspect-square'

  const activeColor = p.colors[activeColorIdx] || p.colors[0]

  const handleQuickAdd = async (variant, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (variant.stock <= 0 || String(variant.id).startsWith('temp-')) return

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
        {variants.length > 0 && (() => {
          const total = variants.reduce((s, v) => s + v.stock, 0)
          return total > 0 && total <= 5 ? (
            <span className="border border-accent bg-ink/85 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-accent">
              CHỈ CÒN {total} ĐÔI
            </span>
          ) : null
        })()}
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
          {(variants.length > 0 ? variants.filter((v) => v.stock > 0) : FALLBACK_SIZES).map((v) => (
            <button
              key={v.id}
              onClick={(e) => handleQuickAdd(v, e)}
              className="rounded border border-white/20 px-2 py-1 text-[11px] font-mono font-bold text-paper transition-all hover:border-accent hover:bg-accent hover:text-ink"
            >
              {v.size}
              {v.stock <= 3 && !String(v.id).startsWith('temp-') && (
                <span className="text-accent"> ·{v.stock}</span>
              )}
            </button>
          ))}
          {variants.length > 0 && variants.every((v) => v.stock <= 0) && (
            <span className="font-mono text-[11px] text-paper/40">HẾT HÀNG — XEM CHI TIẾT ĐỂ NHẬN BÁO KHI CÓ HÀNG</span>
          )}
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
