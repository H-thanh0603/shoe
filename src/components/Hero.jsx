import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { matchScore, sortProducts } from '../lib/match.js'
import { timeContext } from '../lib/time.js'
import { useMagnetic } from '../hooks/useMagnetic.js'
import HeroShoe from './HeroShoe.jsx'
import { isWebGLAvailable } from '../lib/webgl.js'
// three.js chunk riêng — chỉ tải khi hero 3D hiện
const ShoeViewer3D = lazy(() => import('./ShoeViewer3D.jsx'))
import { playTechClick, playSwitch, isAudioMuted, setAudioEnabled } from '../lib/sound.js'

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

export default function Hero({ onQuiz }) {
  const ref = useRef(null)
  const [exploded, setExploded] = useState(false)
  const [selectedColor, setSelectedColor] = useState(COLORWAYS[0].hex)
  const [activeHotspot, setActiveHotspot] = useState('cushion')
  const [soundOn, setSoundOn] = useState(() => !isAudioMuted())
  const [webgl] = useState(() => isWebGLAvailable())
  const realtime = webgl && !exploded
  const quizBtn = useMagnetic(14)
  const dropBtn = useMagnetic(14)

  const { profile } = useProfile()
  const { data: products } = useApi('/products?limit=100')
  const { greeting } = useMemo(() => timeContext(), [])
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
      const parts = el.querySelectorAll('[data-intro]')
      animate(parts, { opacity: 0, y: 44, duration: 1 })
      requestAnimationFrame(() => {
        if (cancelled) return
        animate(parts, {
          opacity: [0, 1],
          y: [44, 0],
          duration: 1000,
          delay: stagger(120),
          ease: 'outExpo',
        })
      })
    }
    return () => { cancelled = true; io.disconnect() }
  }, [])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    setAudioEnabled(next)
    if (next) playTechClick()
  }

  const handleColorSelect = (hex) => {
    setSelectedColor(hex)
    playSwitch()
  }

  const toggleExploded = () => {
    playTechClick()
    setExploded((prev) => !prev)
  }

  return (
    <section ref={ref} className="reveal relative flex min-h-svh flex-col overflow-hidden pt-16">
      {/* lưới kỹ thuật */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* aurora nhiều màu sau canvas */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-accent/25 blur-[110px] animate-aurora-a" />
        <div className="absolute top-1/3 -right-28 h-[460px] w-[460px] rounded-full bg-[#7c5cff]/20 blur-[120px] animate-aurora-b" />
        <div className="absolute -bottom-32 left-1/3 h-[380px] w-[520px] rounded-full bg-[#37d67a]/15 blur-[120px] animate-aurora-a" />
      </div>

      {/* chữ outline khổng lồ sau canvas */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="display-xl text-stroke select-none tracking-tighter">
          {l1}
        </span>
      </div>

      {/* sân khấu 3D / X-ray */}
      <div className="absolute inset-0">
        {realtime ? (
          <Suspense fallback={null}>
            <ShoeViewer3D colorway={selectedColor} stage />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center px-4">
            <div className="w-full max-w-[560px]">
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

      {/* lớp chữ trước canvas */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-end">
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
          <p data-intro className="flex items-center gap-3 text-xs font-semibold tracking-[0.25em] text-paper/60 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            {greeting} · SS26 PROTOTYPE · DROP 004 LIVE
          </p>
          <h1 data-intro className="display-xl mt-2 mix-blend-screen">
            {l1}<br />
            <span className="text-accent">{l2}</span>
          </h1>
          {top && (
            <p data-intro className="mt-3 text-xs tracking-wide text-paper/60">
              {matchScore(profile, top)?.pct}% MATCH CHO BẠN —{' '}
              <a href={`#/san-pham/${top.slug}`} className="pointer-events-auto text-accent underline underline-offset-4 hover:text-accent-hot">
                {top.name}
              </a>
            </p>
          )}
        </div>

        {/* thanh điều khiển đáy */}
        <div data-intro className="mt-6 border-t border-white/10 bg-ink/60 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
            {/* mode + colorway */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded border border-white/15 p-1">
                <button
                  onClick={() => { if (exploded) toggleExploded() }}
                  className={`px-3 py-1.5 text-xs font-semibold tracking-wider transition-all ${!exploded ? 'bg-accent text-ink' : 'text-paper/60 hover:text-paper'}`}
                >
                  {webgl ? '3D' : 'TILT'}
                </button>
                <button
                  onClick={() => { if (!exploded) toggleExploded() }}
                  className={`px-3 py-1.5 text-xs font-semibold tracking-wider transition-all ${exploded ? 'bg-accent text-ink' : 'text-paper/60 hover:text-paper'}`}
                >
                  X-RAY
                </button>
              </div>
              <div className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-1.5">
                {COLORWAYS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleColorSelect(c.hex)}
                    aria-label={`Chọn màu ${c.name}`}
                    title={c.name}
                    className={`h-5 w-5 rounded-full border transition-all ${selectedColor === c.hex ? 'scale-125 border-white ring-2 ring-accent/60' : 'border-white/30 hover:scale-110'}`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              <button
                onClick={toggleSound}
                title={soundOn ? 'Âm thanh bật' : 'Âm thanh tắt'}
                className={`rounded border border-white/15 px-3 py-1.5 font-mono text-[11px] tracking-widest transition-colors ${soundOn ? 'text-accent' : 'text-paper/50 hover:text-paper'}`}
              >
                {soundOn ? 'SFX ON' : 'SFX OFF'}
              </button>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 font-mono text-[11px] tracking-widest text-paper/40 lg:flex">
                <span className="inline-block h-8 w-px animate-scrollcue bg-accent" />
                CUỘN
              </span>
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
          </div>
        </div>
      </div>

      {/* spec dọc cạnh phải */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 z-10 hidden -translate-y-1/2 rotate-90 xl:block">
        <span className="font-mono text-[10px] tracking-[0.35em] whitespace-nowrap text-paper/35">
          285G · 8MM DROP · LIMITED 120 PAIRS
        </span>
      </div>
    </section>
  )
}
