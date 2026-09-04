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
      className="reveal relative overflow-hidden bg-gradient-to-br from-[#d9f99d] via-[#a3e635] to-[#22d3ee]"
    >
      {/* deco circles */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/25 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-[#d43a2a]/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 md:grid-cols-2 md:px-8 md:py-32">
        <div>
          <p className="inline-block bg-ink px-3 py-1 text-[11px] font-bold tracking-[0.3em] text-[#a3e635]">DROP 004 · LIMITED</p>
          <h2 className="display-l mt-4 text-ink">
            AIR<br />VECTOR 01
          </h2>
          <p className="mt-6 max-w-sm text-sm font-medium text-ink/70">
            Chỉ 120 đôi. Không restock. Không thông báo trước.
          </p>
          <a
            href="#"
            className="mt-8 inline-flex items-center gap-2 bg-ink px-10 py-4 text-sm font-semibold tracking-widest text-[#e8e6e1] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
          >
            ĐẶT TRƯỚC NGAY
          </a>
        </div>

        <div className="flex flex-col items-start gap-8 md:items-end">
          <p className="text-[11px] font-bold tracking-[0.3em] text-ink/60">CHỈ CÒN</p>
          <div className="flex items-baseline gap-2 font-display font-bold tabular-nums" role="timer" aria-label="Thời gian còn lại">
            <span className="display-l text-ink">{h}</span>
            <span className="display-l text-ink/40">:</span>
            <span className="display-l text-ink">{m}</span>
            <span className="display-l text-ink/40">:</span>
            <span className="display-l text-ink">{s}</span>
          </div>
          <p className="font-display text-6xl font-bold leading-none text-ink md:text-8xl">
            {drop?.pairs ?? 120}<span className="text-ink/40">/</span>ĐÔI
          </p>
        </div>
      </div>
    </section>
  )
}
