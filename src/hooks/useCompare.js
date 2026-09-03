import { useCallback, useMemo, useState } from 'react'

const MAX_ITEMS = 3

// So sánh tối đa 3 sản phẩm — thêm quá thì đẩy món cũ nhất ra
export function useCompare() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  const toggle = useCallback((product) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === product.id)) return prev.filter((x) => x.id !== product.id)
      if (prev.length >= MAX_ITEMS) return [...prev.slice(1), product]
      return [...prev, product]
    })
  }, [])

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const clear = useCallback(() => {
    setItems([])
    setOpen(false)
  }, [])

  const ids = useMemo(() => items.map((x) => x.id), [items])

  return { items, ids, open, setOpen, toggle, remove, clear }
}
