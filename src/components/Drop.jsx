import { useEffect, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'

// Limited drop (DESIGN.md §48-49): event feel, countdown monospaced, no glow spam.
function useCountdown(target) {
  const [left, setLeft] = useState(() => target - Date.now())
  useEffect(() => {
    const t = setInterval(() => setLeft(target - Date.now()), 1000)
    return () => clearInterval(t)
  }, [target])
  const s = Math.max(0, Math.floor(left / 1000))
  return {
    h: String(Math.floor(s / 3600)).padStart(2, '0'),
    m: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    s: String(s % 60).padStart(2, '0'),
  }
}

export default function Drop() {
  const ref = useRef(null)
  const { data: drop } = useApi('/drop')
  // fallback +72h nếu API chưa lên — tránh countdown đứng
  const target = drop ? new Date(drop.ends_at).getTime() : Date.now() + 72 * 3600 * 1000
  const { h, m, s } = useCountdown(target)

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.2 },
    )
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  return (
    <section
      id="drop"
      ref={ref}
      className="reveal relative overflow-hidden border-t border-accent/30 bg-charcoal"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 md:grid-cols-2 md:px-8 md:py-32">
        <div>
          <p className="text-[11px] tracking-[0.3em] text-accent">DROP 004</p>
          <h2 className="display-l mt-4 text-paper">
            AIR<br />VECTOR 01
          </h2>
          <p className="mt-6 max-w-sm text-sm text-paper/60">
            Chỉ 120 đôi. Không restock. Không thông báo trước.
          </p>
          <a
            href="#"
            className="mt-8 inline-flex items-center gap-2 border border-accent bg-accent px-10 py-4 text-sm font-semibold tracking-widest text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent focus-visible:bg-transparent focus-visible:text-accent"
          >
            ĐẶT TRƯỚC NGAY
          </a>
        </div>

        <div className="flex flex-col items-start gap-8 md:items-end">
          <p className="text-[11px] tracking-[0.3em] text-paper/50">CHỈ CÒN</p>
          <div className="flex items-baseline gap-2 font-display font-bold tabular-nums" role="timer" aria-label="Thời gian còn lại">
            <span className="display-l text-paper">{h}</span>
            <span className="display-l text-accent">:</span>
            <span className="display-l text-paper">{m}</span>
            <span className="display-l text-accent">:</span>
            <span className="display-l text-paper">{s}</span>
          </div>
          <p className="font-display text-6xl font-bold leading-none text-paper md:text-8xl">
            {drop?.pairs ?? 120}<span className="text-accent">/</span>ĐÔI
          </p>
        </div>
      </div>
    </section>
  )
}
