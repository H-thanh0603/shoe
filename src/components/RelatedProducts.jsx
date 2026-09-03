import { useMemo } from 'react'
import { useApi } from '../hooks/useApi.js'
import { Card } from './ProductCard.jsx'

// Gợi ý cùng mục đích/thương hiệu/tags — không cần endpoint riêng
function score(current, p) {
  let s = 0
  if (p.purpose && p.purpose === current.purpose) s += 3
  if (p.brand === current.brand) s += 2
  const tags = new Set(current.tags || [])
  for (const t of p.tags || []) if (tags.has(t)) s += 1
  return s
}

export function RelatedProducts({ current, wishlist, onWishlist }) {
  const { data: products } = useApi('/products?limit=100')

  const related = useMemo(() => {
    if (!products || !current) return []
    return products
      .filter((p) => p.id !== current.id)
      .map((p) => ({ p, s: score(current, p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.p)
  }, [products, current])

  if (!related.length) return null

  return (
    <section className="mt-20 border-t border-white/10 pt-12">
      <h3 className="font-display text-xl font-bold text-paper">
        BẠN CŨNG SẼ THÍCH<span className="text-accent">.</span>
      </h3>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {related.map((p) => (
          <Card key={p.id} p={p} onWishlist={onWishlist} isWishlisted={wishlist?.includes(p.id)} />
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
