import { useCallback, useState } from 'react'
import { apiGet } from '../lib/api.js'

// Cache module-level: tránh fetch lặp lại khi hover nhiều Card cùng slug
const variantCache = new Map()

export function useVariants(slug) {
  const [variants, setVariants] = useState(() => variantCache.get(slug) || [])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (variantCache.has(slug)) {
      setVariants(variantCache.get(slug))
      return
    }
    setLoading(true)
    try {
      const data = await apiGet(`/products/${slug}`)
      if (data?.variants) {
        variantCache.set(slug, data.variants)
        setVariants(data.variants)
      }
    } catch {
      // fallback: giữ size mặc định ở Card
    } finally {
      setLoading(false)
    }
  }, [slug])

  return { variants, loading, load }
}
