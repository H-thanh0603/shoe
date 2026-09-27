import { useEffect, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { SLOT_BL } from '../lib/overlay.js'

// Social-proof ticker THẬT (GET /live/feed): xoay 1 dòng mỗi 5s, góc dưới trái.
// Poll 30s bằng cách đổi url param (useApi refetch theo url).
//
// Review end-user (mục 3/8): đây là NGUỒN SOCIAL PROOF DUY NHẤT. Component
// CommunityFeed (mảng NOTIFS hardcode: "Minh T. vừa đặt…", "AIR VECTOR 01 chỉ còn
// 38 đôi khả dụng") đã bị xoá — nó bịa hoạt động mua và bịa tồn kho, trong khi
// route /live/feed đã trả dữ liệu thật từ DB (server/routes/live.js:1). Nút tắt
// được chuyển sang đây (nhớ theo session) để xoá nó không làm mất quyền điều
// khiển của người dùng.
const DISMISS_KEY = 'kinetic:livefeed-off'
const ROTATE_MS = 5000
const MAX_ROTATIONS = 6 // ~30s rồi dừng ở dòng cuối, không xoay mãi
function ago(at) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000))
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  return `${Math.floor(s / 3600)} giờ trước`
}

export default function LiveFeed() {
  const [tick, setTick] = useState(0)
  const [idx, setIdx] = useState(0)
  // Tắt được và nhớ theo session. Trước đây chỉ CommunityFeed có nút tắt, mà
  // state nằm trong component nên mỗi lần reload (tức mỗi lần điều hướng) là
  // thông báo quay lại — nút tắt gần như vô nghĩa.
  const [off, setOff] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  // tạm dừng khi người dùng đang đọc/đang nhắm vào nút tắt — nội dung không được
  // đổi dưới con trỏ
  const [paused, setPaused] = useState(false)
  const rotations = useRef(0)

  const dismiss = () => {
    setOff(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  useEffect(() => {
    const poll = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(poll)
  }, [])

  const { data } = useApi(`/live/feed${tick ? `?t=${tick}` : ''}`)
  const items = data?.items || []

  useEffect(() => {
    if (off || paused || items.length < 2) return undefined
    if (rotations.current >= MAX_ROTATIONS) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const rot = setInterval(() => {
      if (document.visibilityState !== 'visible') return // tab ẩn: không xoay
      rotations.current += 1
      if (rotations.current > MAX_ROTATIONS) { clearInterval(rot); return }
      setIdx((i) => (i + 1) % items.length)
    }, ROTATE_MS)
    return () => clearInterval(rot)
  }, [items.length, off, paused])

  if (off || !items.length) return null
  const it = items[idx % items.length]
  // aria-live="off" + KHÔNG role="status": trước đây role="status" (aria-live
  // polite + atomic ngầm định) làm screen reader đọc lại TOÀN BỘ vùng này mỗi
  // 5 giây, mãi mãi, trên mọi trang — nội dung vẫn nằm trong cây trợ năng để đọc
  // khi người dùng muốn, chỉ là không tự ngắt lời họ nữa.
  return (
    <div
      aria-live="off"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={`${SLOT_BL} flex max-w-[calc(100vw-6.5rem)] animate-fadeIn items-center gap-2 border border-white/10 bg-charcoal/90 px-3 py-2 backdrop-blur-sm md:max-w-none`}
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
      <p key={idx} className="max-w-[360px] animate-fadeIn truncate text-xs text-paper/80">{it.text}</p>
      <span className="shrink-0 text-[10px] text-paper/40">{ago(it.at)}</span>
      <button
        onClick={dismiss}
        aria-label="Tắt thông báo cộng đồng"
        className="flex h-6 w-6 shrink-0 items-center justify-center text-paper/40 transition-colors hover:text-paper"
      >
        ✕
      </button>
    </div>
  )
}
