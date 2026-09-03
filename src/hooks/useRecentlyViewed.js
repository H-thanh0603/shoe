import { useCallback, useState } from 'react'

const KEY = 'kinetic_recent'
const MAX = 8

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

// Lưu snapshot tối giản (không fetch lại) — tối đa 8 món mới nhất
export function useRecentlyViewed(currentSlug) {
  const [items, setItems] = useState(read)

  const push = useCallback((snap) => {
    setItems((prev) => {
      const next = [snap, ...prev.filter((x) => x.slug !== snap.slug)].slice(0, MAX)
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const visible = currentSlug ? items.filter((x) => x.slug !== currentSlug) : items
  return { items: visible, push }
}
