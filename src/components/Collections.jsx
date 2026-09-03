import { useEffect, useMemo, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { matchScore } from '../lib/match.js'

// Collections như campaign (DESIGN.md §30-31): mỗi cái 1 mood + block màu riêng.
const bgMap = {
  charcoal: 'bg-charcoal-2 text-paper',
  deep: 'bg-ink-deep text-paper',
  paper: 'bg-paper text-ink',
  accent: 'bg-accent text-ink',
}

function CollectionCard({ c, i }) {
  return (
    <a
      href="#"
      className={`group relative flex aspect-[4/5] flex-col justify-between overflow-hidden p-6 transition-transform duration-300 hover:-translate-y-1 md:aspect-auto md:min-h-[340px] ${bgMap[c.bg]} ${c.invert ? 'bg-paper text-ink' : ''}`}
    >
      <span className="text-[11px] tracking-widest opacity-60">
        {String(i + 1).padStart(2, '0')} / SS26
      </span>

      <div>
        <h3 className="font-display text-3xl font-bold leading-none md:text-4xl">
          {c.name}
        </h3>
        <p className="mt-2 text-sm opacity-70">{c.desc}</p>
        <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-widest">
          KHÁM PHÁ
          <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
        </span>
      </div>

      {/* decorative ring — streetwear mark */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="absolute -right-6 -bottom-6 h-40 w-40 opacity-10 transition-transform duration-500 group-hover:rotate-45"
      >
        <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="6" />
      </svg>
    </a>
  )
}

export default function Collections() {
  const ref = useRef(null)
  const { data: collections, error } = useApi('/collections')
  const { profile } = useProfile()
  const { data: products } = useApi('/products?limit=100')
  // avg match sp thuộc collection → sort collection "dành cho bạn" lên trước
  const sorted = useMemo(() => {
    if (!profile || !collections || !products) return collections
    const avg = (col) => {
      const items = products.filter((p) => p.collection_id === col.id).map((p) => matchScore(profile, p)?.pct ?? 0)
      return items.length ? items.reduce((a, b) => a + b, 0) / items.length : -1
    }
    return [...collections].sort((a, b) => avg(b) - avg(a))
  }, [profile, collections, products])
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.1 },
    )
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className="reveal border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
        <h2 className="display-l mb-10 text-paper">BỘ SƯU TẬP</h2>
        {error && <p className="text-sm text-accent">Không tải được collections — kiểm tra server.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sorted?.map((c, i) => (
            <CollectionCard key={c.slug} c={c} i={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
