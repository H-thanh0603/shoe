import { useMemo, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { useAnimeReveal } from '../hooks/useAnimeReveal.js'
import { sortProducts } from '../lib/match.js'
import { Card } from './ProductCard.jsx'

// Trang chủ chỉ khoe 8 đôi hợp nhất — duyệt full sang #/shop
export default function FeaturedStrip({ onToggleCompare, compareIds = [] }) {
  const ref = useRef(null)
  const { data: products } = useApi('/products?limit=100')
  const { profile } = useProfile()
  const { wishlist, toggle: toggleWishlist } = useWishlist()
  useAnimeReveal(ref)

  const top8 = useMemo(
    () => sortProducts(profile, products || []).slice(0, 8),
    [profile, products],
  )

  if (!top8.length) return null
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20">
      <div className="mb-8 flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <span data-anime className="font-mono text-xs tracking-widest text-accent uppercase">
            NỔI BẬT //
          </span>
          <h2 data-anime className="display-l mt-1 text-paper">
            {profile ? 'HỢP CHÂN BẠN' : 'ĐÁNG MUA NHẤT'}
          </h2>
        </div>
        <a data-anime href="#/shop" className="group flex items-center gap-2 font-mono text-xs tracking-widest text-paper/60 hover:text-accent">
          XEM TẤT CẢ {products?.length || ''} ĐÔI
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {top8.map((p) => (
          <Card
            key={p.id}
            p={p}
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
