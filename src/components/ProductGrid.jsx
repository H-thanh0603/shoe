import { useEffect, useMemo, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { matchScore, sortProducts } from '../lib/match.js'

// Editorial asymmetric grid (DESIGN.md §24-27): span variants phá nhịp đều,
// card tối giản: image / brand / name / price / color dots.
export function Card({ p, match }) {
  const spanCls =
    p.span === 'wide' ? 'md:col-span-2 aspect-[2.2/1]' :
    p.span === 'tall' ? 'md:row-span-2 aspect-[1/2.1]' :
    'aspect-square'

  return (
    <a
      href={`#/san-pham/${p.slug}`}
      className={`group relative flex flex-col border border-white/10 bg-charcoal transition-colors duration-300 hover:border-accent ${spanCls} min-w-0 overflow-hidden`}
    >
      {/* image placeholder — shoe silhouette tinted theo color[0], swap bằng ảnh thật sau */}
      <div
        className="flex flex-1 items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-[1.04]"
        style={{ background: `color-mix(in oklab, ${p.colors[0]} 30%, #16161a)` }}
      >
        <svg viewBox="0 0 520 220" className="w-[80%] opacity-80" aria-hidden="true">
          <path d="M20 170 Q10 190 40 195 L480 195 Q510 190 505 165 L470 150 L60 150 Q30 155 20 170Z" fill={p.colors[0] === '#e8e6e1' ? '#0a0a0a' : p.colors[0]} />
          <path d="M60 150 Q80 60 200 55 Q300 50 350 90 L420 80 Q470 90 470 150 L60 150Z" fill="#e8e6e1" opacity="0.9"/>
          <path d="M60 150 Q150 120 470 150 L460 160 Q160 130 60 150Z" fill="#0a0a0a" opacity="0.85"/>
        </svg>
      </div>

      {p.tag && (
        <span className="absolute top-3 left-3 bg-accent px-2 py-0.5 text-[10px] font-bold tracking-widest text-ink">
          {p.tag}
        </span>
      )}
      {match != null && (
        <span className="absolute top-3 right-3 border border-accent/60 bg-ink/80 px-2 py-0.5 font-mono text-[10px] tracking-widest text-accent">
          {match}% MATCH
        </span>
      )}

      {/* info row */}
      <div className="flex items-end justify-between gap-3 border-t border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-widest text-paper/50">{p.brand}</p>
          <h3 className="truncate font-display text-sm font-semibold text-paper">{p.name}</h3>
          <p className="text-sm text-accent">{p.price}</p>
        </div>
        <div className="flex shrink-0 gap-1.5" aria-label="Màu可用">
          {p.colors.map((c) => (
            <span key={c} className="h-3 w-3 rounded-full border border-white/30" style={{ background: c }} />
          ))}
        </div>
      </div>
    </a>
  )
}

export default function ProductGrid() {
  const ref = useRef(null)
  const { data: products, error } = useApi('/products?limit=100')
  const { profile } = useProfile()
  const sorted = useMemo(() => sortProducts(profile, products || []), [profile, products])
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.1 },
    )
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className="reveal mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
      <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <h2 className="display-l text-paper">{profile ? 'DÀNH CHO BẠN' : 'MỚI VỀ'}</h2>
        <a href="#" className="text-sm font-medium tracking-widest text-paper/60 transition-colors duration-200 hover:text-accent">
          XEM TẤT CẢ →
        </a>
      </div>

      {error && <p className="text-sm text-accent">Không tải được sản phẩm — kiểm tra server (npm start trong server/).</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:grid-rows-[repeat(4,minmax(0,220px))]">
        {sorted.map((p) => (
          <Card key={p.id} p={p} match={profile && matchScore(profile, p)?.pct} />
        ))}
      </div>
    </section>
  )
}
