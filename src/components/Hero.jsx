import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { matchScore, sortProducts } from '../lib/match.js'
import { useMagnetic } from '../hooks/useMagnetic.js'
import HeroShoe from './HeroShoe.jsx'
import { isWebGLAvailable } from '../lib/webgl.js'
// three.js chunk riêng — chỉ tải khi hero 3D hiện
const ShoeViewer3D = lazy(() => import('./ShoeViewer3D.jsx'))
import { playTechClick, playSwitch } from '../lib/sound.js'

const HEADLINE = {
  running: ['RUN', 'YOUR CITY'],
  street: ['WALK', 'LOUDER'],
  court: ['OWN', 'THE COURT'],
  daily: ['MOVE', 'ALL DAY'],
  trail: ['RUN', 'WILD'],
}

const COLORWAYS = [
  { id: 'crimson', name: 'CRIMSON KINETIC', hex: '#d43a2a' },
  { id: 'volt', name: 'CYBER VOLT', hex: '#9be15d' },
  { id: 'ice', name: 'ARCTIC ICE', hex: '#5db4ff' },
  { id: 'obsidian', name: 'TRIPLE OBSIDIAN', hex: '#111113' },
]

// chữ nhảy từng ký tự
function KineticLine({ text, className }) {
  return (
    <span className={`flex overflow-hidden ${className || ''}`} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={i} data-letter className="inline-block will-change-transform" aria-hidden="true">
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  )
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export default function Hero({ onQuiz }) {
  const ref = useRef(null)
  const [exploded, setExploded] = useState(false)
  const [selectedColor, setSelectedColor] = useState(COLORWAYS[0].hex)
  const [activeHotspot, setActiveHotspot] = useState('cushion')
  const [webgl] = useState(() => isWebGLAvailable())
  const realtime = webgl && !exploded
  const quizBtn = useMagnetic(14)
  const dropBtn = useMagnetic(14)
  const clock = useClock()

  const { profile } = useProfile()
  const { data: products } = useApi('/products?limit=100')
  const top = useMemo(() => sortProducts(profile, products || [])[0], [profile, products])
  const headline = profile && HEADLINE[profile.purpose]
  const [l1, l2] = headline || ['MOVE', 'DIFFERENT']

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.05 },
    )
    io.observe(el)
    let cancelled = false
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const letters = el.querySelectorAll('[data-letter]')
      const fades = el.querySelectorAll('[data-intro]')
      animate(letters, { yPercent: 110, duration: 1 })
      animate(fades, { opacity: 0, y: 24, duration: 1 })
      requestAnimationFrame(() => {
        if (cancelled) return
        animate(letters, { yPercent: [110, 0], duration: 900, delay: stagger(35), ease: 'outExpo' })
        animate(fades, { opacity: [0, 1], y: [24, 0], duration: 800, delay: stagger(90, { start: 400 }), ease: 'outExpo' })
      })
    }
    return () => { cancelled = true; io.disconnect() }
  }, [])

  const handleColorSelect = (hex) => {
    setSelectedColor(hex)
    playSwitch()
  }

  return (
    <section ref={ref} className="reveal relative overflow-hidden pt-16">
      <div className="mx-auto grid max-w-7xl gap-0 px-4 md:grid-cols-[1.05fr_0.95fr] md:px-8">
        {/* TRÁI — tối, chữ kinetic */}
        <div className="relative flex flex-col justify-center py-14 md:min-h-svh md:py-10">
          <p data-intro className="flex items-center gap-3 text-xs font-semibold tracking-[0.25em] text-paper/60 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            SS26 PROTOTYPE · DROP 004 LIVE
          </p>

          <h1 className="display-xl mt-4">
            <KineticLine text={l1} />
            <KineticLine text={l2} className="text-accent" />
          </h1>

          <p data-intro className="mt-5 max-w-md text-sm leading-relaxed text-paper/60">
            Giày chạy phố thiết kế tại Hà Nội — đệm Nitro, tấm carbon, lưới ripstop.
            Làm quiz 30 giây để tìm đôi hợp chân bạn nhất.
          </p>

          {top && (
            <p data-intro className="mt-3 text-xs tracking-wide text-paper/60">
              {matchScore(profile, top)?.pct}% MATCH CHO BẠN —{' '}
              <a href={`#/san-pham/${top.slug}`} className="text-accent underline underline-offset-4 hover:text-accent-hot">
                {top.name}
              </a>
            </p>
          )}

          <div data-intro className="mt-8 flex flex-wrap items-center gap-3">
            <button
              ref={quizBtn}
              onClick={onQuiz}
              className="border border-white/20 bg-ink-deep/60 px-6 py-3.5 text-xs font-bold tracking-widest text-paper/80 transition-colors hover:border-accent hover:text-accent"
            >
              DISCOVER YOUR STYLE →
            </button>
            <a
              ref={dropBtn}
              href="#drop"
              className="group flex items-center gap-2 border border-accent bg-accent px-8 py-3.5 text-xs font-bold tracking-widest text-ink transition-colors hover:bg-transparent hover:text-accent"
            >
              XEM DROP
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </div>

          <div data-intro className="mt-10 flex items-center gap-6 font-mono text-[11px] tracking-widest text-paper/40">
            <span className="tabular-nums">{clock} HN</span>
            <span className="h-3 w-px bg-white/15" />
            <span>285G · 8MM DROP</span>
            <span className="h-3 w-px bg-white/15" />
            <span className="text-accent">120 PAIRS</span>
          </div>
        </div>

        {/* PHẢI — panel sáng vòm cong + 3D */}
        <div data-intro className="relative min-h-[420px] overflow-hidden rounded-t-[999px] rounded-b-3xl bg-[#ece5d8] md:min-h-svh md:rounded-t-[999px]">
          {/* hạt màu trang trí */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute top-16 -left-10 h-56 w-56 rounded-full bg-[#d43a2a]/15 blur-3xl" />
            <div className="absolute right-0 bottom-24 h-64 w-64 rounded-full bg-[#5db4ff]/20 blur-3xl" />
          </div>
          <p className="absolute top-8 left-1/2 z-10 -translate-x-1/2 font-mono text-[10px] tracking-[0.35em] whitespace-nowrap text-ink/50">
            AIR VECTOR 01 — 360°
          </p>

          <div className="absolute inset-0 pt-10">
            {realtime ? (
              <Suspense fallback={<p className="py-24 text-center font-mono text-xs text-ink/40">ĐANG DỰNG 3D…</p>}>
                <ShoeViewer3D colorway={selectedColor} stage />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="w-full max-w-[420px]">
                  <HeroShoe
                    colorway={selectedColor}
                    exploded={exploded}
                    activeHotspot={activeHotspot}
                    setActiveHotspot={(h) => { setActiveHotspot(h); playTechClick() }}
                    onHotspotClick={(h) => { setActiveHotspot(h); playTechClick() }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* huy hiệu xoay */}
          <div aria-hidden="true" className="absolute right-5 bottom-24 z-10 hidden h-24 w-24 md:block">
            <svg viewBox="0 0 100 100" className="h-full w-full animate-spin-slower">
              <defs><path id="circ" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" /></defs>
              <text className="fill-ink/70 font-mono" fontSize="10.5" letterSpacing="2.5">
                <textPath href="#circ">KINETIC SS26 • MOVE DIFFERENT •</textPath>
              </text>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg text-accent">↓</span>
          </div>

          {/* colorway dạng tên */}
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-ink/10 bg-white/70 px-2 py-1.5 backdrop-blur-md">
            {COLORWAYS.map((c) => (
              <button
                key={c.id}
                onClick={() => handleColorSelect(c.hex)}
                title={c.name}
                aria-label={`Chọn màu ${c.name}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wider transition-all ${selectedColor === c.hex ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink'}`}
              >
                <span className="h-3 w-3 rounded-full border border-ink/20" style={{ backgroundColor: c.hex }} />
                {selectedColor === c.hex && <span>{c.name}</span>}
              </button>
            ))}
            <button
              onClick={() => { playTechClick(); setExploded((v) => !v) }}
              className="ml-1 rounded-full bg-accent px-2.5 py-1 font-mono text-[10px] font-bold text-ink"
            >
              {exploded ? '3D' : 'X-RAY'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
