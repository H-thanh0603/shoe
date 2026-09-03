// Shoe Profile store (Bước 7.2) — localStorage + useSyncExternalStore, không context provider.
// Pure computeProfile tách riêng để test + match.js import prefs shape.
import { useSyncExternalStore } from 'react'

const KEY = 'shoe_profile_v1'

// prefs: weight 0-100 mỗi trục — tổng ~100 (quiz đóng góp tự nhiên, không normalize lại)
// ponytail: weights chọn để sum ≤100 — cần normalize nếu thêm câu hỏi
export function computeProfile(a) {
  const prefs = { performance: 0, comfort: 0, style: 0, durability: 0, daily: 0 }
  const P = { // purpose → điểm trục
    running: { performance: 45, daily: 10 },
    street: { style: 40, daily: 10 },
    court: { performance: 30, durability: 20 },
    daily: { daily: 30, comfort: 20 },
    trail: { durability: 35, performance: 15 },
  }[a.purpose] || { daily: 20 }
  const S = { // style ưu tiên
    minimal: { comfort: 15 },
    bold: { style: 15 },
    retro: { style: 10, durability: 10 },
    future: { performance: 10, style: 10 },
  }[a.style] || {}
  const Q = { // câu "điều gì quan trọng nhất" → trục dominant
    comfort: { comfort: 25 },
    speed: { performance: 25 },
    looks: { style: 25 },
    tough: { durability: 25 },
  }[a.priority] || {}
  for (const src of [P, S, Q])
    for (const k in src) prefs[k] = Math.min(100, prefs[k] + src[k])

  return {
    v: 1,
    purpose: a.purpose,
    style: a.style,
    colors: a.colors,                    // hex[] người dùng chọn
    brands: a.brands,                   // string[] uppercase
    budget: a.budget,                    // 'under-2m' | '2-4m' | '4m+'
    prefs,
    accent: a.accent,                    // 'red' | 'lime' | 'ice' | 'magenta'
    createdAt: new Date().toISOString(),
  }
}

// ---- storage (try/catch — Safari private mode block localStorage) ----
const listeners = new Set()
// useSyncExternalStore cần getSnapshot cached — trả cùng ref tới khi write()
let cached = null, cachedRaw = undefined
const read = () => {
  const raw = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
  if (raw !== cachedRaw) { cachedRaw = raw; cached = (() => { try { return JSON.parse(raw) || null } catch { return null } })() }
  return cached
}
const write = (v) => {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch {}
  listeners.forEach((fn) => fn())
}

export const saveProfile = (p) => write(p)
export const clearProfile = () => write(null)

export function useProfile() {
  const profile = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    read,
    () => null, // SSR guard không cần (SPA) nhưng useSyncExternalStore cần getServerSnapshot
  )
  return { profile, has: !!profile }
}

// trait % hiển thị ở Nav chip — trục lớn nhất trong prefs
export const topTrait = (p) => {
  const labels = { performance: 'PERFORMANCE', comfort: 'COMFORT', style: 'FASHION', durability: 'DURABLE', daily: 'DAILY' }
  const k = Object.entries(p?.prefs || {}).sort((x, y) => y[1] - x[1])[0]?.[0]
  return k ? `${p.prefs[k]}% ${labels[k]}` : null
}
