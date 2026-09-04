import { useMemo } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { Card } from '../components/ProductCard.jsx'

// Chi tiết 1 bộ sưu tập: lọc sản phẩm theo collection slug
export default function CollectionDetail({ slug, onToggleCompare, compareIds = [] }) {
  const { data: collections } = useApi('/collections')
  const { data: products, error } = useApi('/products?limit=100')
  const { wishlist, toggle: toggleWishlist } = useWishlist()

  const collection = useMemo(
    () => collections?.find((c) => c.slug === slug),
    [collections, slug],
  )
  const items = useMemo(() => {
    if (!products || !collection) return []
    return products.filter((p) => p.collection_id === collection.id)
  }, [products, collection])

  if (collections && !collection) {
    return (
      <main className="mx-auto max-w-7xl px-4 pt-32 pb-28 md:px-8">
        <p className="font-mono text-sm text-accent">KHÔNG CÓ BỘ SƯU TẬP NÀY.</p>
        <a href="#/bo-suu-tap" className="mt-4 inline-block text-sm text-paper/70 hover:text-accent">← XEM TẤT CẢ</a>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pt-24 pb-28 md:px-8 md:pt-32">
      <a href="#/bo-suu-tap" className="font-mono text-xs tracking-widest text-paper/50 hover:text-accent">← BỘ SƯU TẬP</a>
      <p className="mt-4 font-mono text-xs tracking-widest text-accent uppercase">COLLECTION //</p>
      <h1 className="display-l mt-1 text-paper">{collection?.name || '…'}</h1>
      {collection?.desc && <p className="mt-3 max-w-md text-sm text-paper/60">{collection.desc}</p>}

      {error && <p className="mt-6 text-sm text-accent">Không tải được sản phẩm.</p>}

      {items.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map((p) => (
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
      ) : (
        <p className="mt-10 font-mono text-xs text-paper/50">ĐANG TẢI SẢN PHẨM…</p>
      )}
    </main>
  )
}
