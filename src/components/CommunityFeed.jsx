import { useEffect, useState } from 'react'

const NOTIFS = [
  { id: 1, user: 'Minh T.', city: 'Hà Nội', text: 'vừa đặt AIR VECTOR 01 (Size 42)', time: '2 phút trước', tag: 'DROP ORDER' },
  { id: 2, user: 'Tuấn K.', city: 'TP.HCM', text: 'đánh giá 5 sao cho RUN WILD PRO: "Đệm nitrogen quá êm!"', time: '6 phút trước', tag: 'REVIEW' },
  { id: 3, user: 'Hải An', city: 'Đà Nẵng', text: 'vừa lưu STREET FLOW vào Wishlist', time: '12 phút trước', tag: 'WISHLIST' },
  { id: 4, user: 'KHO DROP', city: 'Global', text: 'AIR VECTOR 01 hiện chỉ còn 38 đôi khả dụng', time: 'Vừa xong', tag: 'STOCK ALERT' },
]

export default function CommunityFeed() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (dismissed) return

    // Show initial notification after 3s
    const startTimer = setTimeout(() => {
      setVisible(true)
    }, 3000)

    // Periodic rotation
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % NOTIFS.length)
        setVisible(true)
      }, 1000)
    }, 9000)

    return () => {
      clearTimeout(startTimer)
      clearInterval(interval)
    }
  }, [dismissed])

  if (dismissed || !visible) return null
  const item = NOTIFS[index]

  return (
    <aside aria-label="Thông báo cộng đồng" className="fixed bottom-6 left-6 z-40 max-w-xs animate-slideUp">
      <div className="flex items-center gap-3 border border-white/15 bg-charcoal/95 p-3.5 shadow-2xl backdrop-blur-md">
        <div className="flex h-2 w-2 shrink-0 rounded-full bg-accent animate-ping" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between font-mono text-[9px] text-paper/40">
            <span className="text-accent font-semibold tracking-wider">{item.tag}</span>
            <span>{item.time}</span>
          </div>
          <p className="mt-1 text-xs text-paper/90 font-sans leading-tight">
            <strong className="text-paper">{item.user}</strong> ({item.city}) {item.text}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-paper/40 hover:text-paper text-xs ml-1"
          title="Tắt thông báo này"
        >
          ✕
        </button>
      </div>
    </aside>
  )
}
