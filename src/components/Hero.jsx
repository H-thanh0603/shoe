import { useEffect, useRef, useState } from 'react'

// Hero (DESIGN.md §16-20): massive typography + shoe protagonist + parallax + cursor tilt.
// Shoe = CSS art silhouette (Tier A) — không cần asset 3D cho homepage đầu.
export default function Hero({ onQuiz }) {
  const ref = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = ref.current
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.2 },
    )
    if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  // ponytail: mousemove trên hero only — global listener tốn hơn, không cần
  const onMove = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({
      x: ((e.clientX - r.left) / r.width - 0.5) * 8,   // subtle ±4deg rotateY
      y: ((e.clientY - r.top) / r.height - 0.5) * -6,  // subtle ±3deg rotateX
    })
  }

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className="reveal relative flex min-h-svh flex-col justify-between overflow-hidden pt-16"
    >
      {/* giant background type — negative space composition */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="display-xl select-none text-charcoal/40">
          KINETIC
        </span>
      </div>

      {/* foreground: split type, shoe between (DESIGN.md §17) */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4">
        <h1 className="display-xl text-center">
          MOVE<br />
          <span className="text-accent">DIFFERENT</span>
        </h1>

        {/* shoe silhouette — CSS art, tilts theo cursor */}
        <div
          className="mt-8 w-[min(70vw,520px)]"
          style={{
            transform: `perspective(800px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`,
            transition: 'transform 400ms var(--ease-out)',
          }}
        >
          <svg viewBox="0 0 520 220" className="w-full drop-shadow-[0_20px_60px_rgba(0,0,0,0.6)]" role="img" aria-label="Air Vector 01 sneaker">
            {/* sole */}
            <path d="M20 170 Q10 190 40 195 L480 195 Q510 190 505 165 L470 150 L60 150 Q30 155 20 170Z" fill="#d43a2a"/>
            {/* upper */}
            <path d="M60 150 Q80 60 200 55 Q300 50 350 90 L420 80 Q470 90 470 150 L60 150Z" fill="#e8e6e1"/>
            {/* overlays */}
            <path d="M200 55 Q300 50 350 90 L370 95 Q320 60 210 60Z" fill="#0a0a0a"/>
            <path d="M350 90 Q420 82 470 110 L470 150 L430 150 Q420 105 350 90Z" fill="#8a8a8f"/>
            {/* laces */}
            <path d="M240 70 L280 100 M270 65 L310 95 M300 62 L340 92" stroke="#0a0a0a" strokeWidth="6" strokeLinecap="round"/>
            {/* swoosh-like accent */}
            <path d="M60 150 Q150 120 470 150 L460 160 Q160 130 60 150Z" fill="#0a0a0a"/>
          </svg>
        </div>

        <p className="mt-6 max-w-md text-center text-sm text-paper/60">
          Sneaker không phải phụ kiện. Là cách bạn di chuyển trong thành phố.
        </p>
      </div>

      {/* bottom meta row */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-end justify-between px-4 pb-8 text-[11px] tracking-widest text-paper/50 md:px-8">
        <span>DROP 004 — LIVE</span>
        <div className="flex items-center gap-3">
          <button
            onClick={onQuiz}
            className="border border-white/15 px-5 py-4 text-sm font-medium tracking-widest text-paper/70 transition-colors duration-200 hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent"
          >
            DISCOVER YOUR STYLE →
          </button>
          <a
            href="#drop"
            className="group flex items-center gap-2 border border-accent bg-accent px-8 py-4 text-sm font-semibold tracking-widest text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent focus-visible:bg-transparent focus-visible:text-accent"
          >
            XEM DROP
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </a>
        </div>
        <span>SS26</span>
      </div>
    </section>
  )
}
