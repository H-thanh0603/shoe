import { useMemo } from 'react'
import { useApi } from '../hooks/useApi.js'
import { Card } from './ProductCard.jsx'

// Serendipity scoring (§unexpected-recommendation): cùng dáng/mục đích nhưng
// KHÁC brand được ưu tiên — xem Nike đề NB 550, không phải Nike thứ 3.
// score trả {s, why} — why dùng cho nhãn card.
function score(current, p) {
  let s = 0
  const why = []
  if (p.purpose && p.purpose === current.purpose) { s += 3; why.push('cùng mục đích') }
  if (p.span && p.span === current.span) { s += 2; why.push('tương tự dáng giày') }
  const tags = new Set(current.tags || [])
  const shared = (p.tags || []).filter((t) => tags.has(t)).length
  s += shared
  if (shared > 0) why.push('cùng tính năng')
  // trừ cùng brand — chống echo chamber; khác brand +1 (serendipity)
  if (p.brand === current.brand) { s -= 2 } else { s += 1; why.push('thử phong cách mới') }
  return { s, why: why.slice(0, 2) }
}

export function RelatedProducts({ current, wishlist, onWishlist }) {
  const { data: products } = useApi('/products?limit=100')

  const related = useMemo(() => {
    if (!products || !current) return []
    return products
      .filter((p) => p.id !== current.id)
      .map((p) => ({ p, ...score(current, p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
  }, [products, current])

  if (!related.length) return null

  return (
    <section className="mt-20 border-t border-white/10 pt-12">
      <h3 className="font-display text-xl font-bold text-paper">
        ĐÁNG THỬ KIA<span className="text-accent">.</span>
      </h3>
      <p className="mt-1 font-mono text-xs text-paper/40">Cùng dáng — khác vibe. Đôi lúc đổi thương hiệu là đổi cả outfit.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {related.map(({ p, why }) => (
          <div key={p.id} className="relative">
            {why?.length > 0 && (
              <span className="absolute -top-2 left-3 z-10 bg-ink/85 px-2 py-0.5 font-mono text-[10px] tracking-widest text-accent">
                {why.map((w) => `✓ ${w}`).join(' · ')}
              </span>
            )}
            <Card p={p} onWishlist={onWishlist} isWishlisted={wishlist?.includes(p.id)} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function RecentlyViewed({ items, wishlist, onWishlist }) {
  if (!items.length) return null
  return (
    <section className="mt-20 border-t border-white/10 pt-12">
      <h3 className="font-display text-xl font-bold text-paper">
        ĐÃ XEM GẦN ĐÂY<span className="text-accent">.</span>
      </h3>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {items.slice(0, 4).map((p) => (
          <Card key={p.slug} p={p} onWishlist={onWishlist} isWishlisted={wishlist?.includes(p.id)} />
        ))}
      </div>
    </section>
  )
}
