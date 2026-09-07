import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api.js'

// Heartbeat tồn kho drop (product duy nhất, thường id=1 seed): poll stock 15s.
// Trả null khi chưa có số — UI giữ trạng thái trước đó, không nhấp nháy.
export function useRemaining(productId = 1, intervalMs = 15_000) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!productId) return undefined
    let alive = true
    const load = () => apiGet(`/products/${productId}`)
      .then((d) => {
        if (!alive) return
        const total = d?.variants?.reduce((s, v) => s + v.stock, 0)
        setRemaining(typeof total === 'number' ? total : null)
      })
      .catch(() => {})
    load()
    const t = setInterval(load, intervalMs)
    return () => { alive = false; clearInterval(t) }
  }, [productId, intervalMs])

  return remaining
}
