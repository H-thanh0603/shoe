import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

// Social-proof ticker thật (GET /live/feed): xoay 1 dòng mỗi 5s, góc dưới trái.
// Poll 30s bằng cách đổi url param (useApi refetch theo url). Ẩn trên mobile để
// không đè sticky bar trang sản phẩm.
function ago(at) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000))
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  return `${Math.floor(s / 3600)} giờ trước`
}

export default function LiveFeed() {
  const [tick, setTick] = useState(0)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const poll = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(poll)
  }, [])

  const { data } = useApi(`/live/feed${tick ? `?t=${tick}` : ''}`)
  const items = data?.items || []

  useEffect(() => {
    if (items.length < 2) return undefined
    const rot = setInterval(() => setIdx((i) => (i + 1) % items.length), 5000)
    return () => clearInterval(rot)
  }, [items.length])

  if (!items.length) return null
  const it = items[idx % items.length]
  return (
    <div
      key={idx}
      role="status"
      className="fixed bottom-4 left-4 z-30 hidden animate-fadeIn items-center gap-2 border border-white/10 bg-charcoal/90 px-3 py-2 backdrop-blur-sm md:flex"
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
      <p className="max-w-[360px] truncate text-xs text-paper/80">{it.text}</p>
      <span className="shrink-0 text-[10px] text-paper/40">{ago(it.at)}</span>
    </div>
  )
}
