import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const KEY = 'kinetic_wishlist'

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function writeLocal(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {}
}

// Wishlist 2 chế độ:
// - Đã login: server là source of truth (đồng bộ đa thiết bị).
// - Guest (401): localStorage như cũ; login xong merge local → server.
// Nghe 'auth-changed' (Nav bắn khi login/logout) để chuyển chế độ.
export function useWishlist() {
  const [wishlist, setWishlist] = useState(readLocal)
  const [serverMode, setServerMode] = useState(false)

  const sync = useCallback(async () => {
    try {
      const items = await apiFetch('/wishlist')
      // merge: món guest đã tim trước login đẩy lên server
      const serverIds = new Set(items.map((p) => p.id))
      for (const id of readLocal()) {
        if (!serverIds.has(id)) {
          try { await apiFetch(`/wishlist/${id}`, { method: 'POST' }) } catch { /* sp ngừng bán — bỏ qua */ }
        }
      }
      const fresh = await apiFetch('/wishlist')
      const ids = fresh.map((p) => p.id)
      setWishlist(ids)
      writeLocal(ids)
      setServerMode(true)
    } catch (e) {
      if (e.status === 401) {
        setWishlist(readLocal())
        setServerMode(false)
      }
    }
  }, [])

  useEffect(() => {
    sync()
    window.addEventListener('auth-changed', sync)
    return () => window.removeEventListener('auth-changed', sync)
  }, [sync])

  const toggle = useCallback(async (id) => {
    const has = wishlist.includes(id)
    setWishlist((prev) => {
      const next = has ? prev.filter((x) => x !== id) : [...prev, id]
      writeLocal(next)
      return next
    })
    if (serverMode) {
      try {
        await apiFetch(`/wishlist/${id}`, { method: has ? 'DELETE' : 'POST' })
      } catch {
        // rollback khi server lỗi (vd sp ngừng bán)
        setWishlist((prev) => {
          const next = has ? [...prev, id] : prev.filter((x) => x !== id)
          writeLocal(next)
          return next
        })
      }
    }
  }, [serverMode, wishlist])

  return { wishlist, toggle, serverMode }
}
