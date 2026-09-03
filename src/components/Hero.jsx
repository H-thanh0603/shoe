import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useProfile } from '../store/profile.js'
import { matchScore, sortProducts } from '../lib/match.js'
import { timeContext } from '../lib/time.js'
import HeroShoe from './HeroShoe.jsx'
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

const HOTSPOTS_DATA = {
  cushion: {
    title: 'NITRO-GEN™ CUSHION FOAM',
    metric: '+85% ENERGY RETURN',
    desc: 'Đệm bọt khí Nitơ áp suất cao giải phóng chấn động gót chân khi tiếp đất.',
    tag: 'MIDSOLE V2',
  },
  carbon: {
    title: '3K TWILL CARBON PLATE',
    metric: 'STIFFNESS LVL 4',
    desc: 'Tấm sợi carbon phản lực tăng tốc bứt phá và chống xoắn lật vòm chân.',
    tag: 'PROPULSION',
  },
  upper: {
    title: 'MONOFILAMENT RIPSTOP MESH',
    metric: '180G ULTRA-LIGHT',
    desc: 'Dệt một mảnh kháng nước mưa nhẹ, thoáng khí 360° theo nhịp bước chạy.',
    tag: 'UPPER TECH',
  },
  traction: {
    title: 'HYPER-HEX VIBRAM® TREAD',
    metric: '4.5MM LUG DEPTH',
    desc: 'Gai lốp cao su ma sát cao chống trơn trượt trên cả mặt đường ướt.',
    tag: 'OUTSOLE GRIP',
  },
}

export default function Hero({ onQuiz }) {
  const ref = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [exploded, setExploded] = useState(false)
  const [selectedColor, setSelectedColor] = useState(COLORWAYS[0].hex)
  const [activeHotspot, setActiveHotspot] = useState('cushion')
  const [soundOn, setSoundOn] = useState(() => !isAudioMuted())

  const { profile } = useProfile()
  const { data: products } = useApi('/products?limit=100')
  const { greeting } = useMemo(() => timeContext(), [])
  const top = useMemo(() => sortProducts(profile, products || [])[0], [profile, products])
  const headline = profile && HEADLINE[profile.purpose]

  useEffect(() => {
    const el = ref.current
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.15 },
    )
    if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  // Mouse move tilt effect (chỉ khi không ở chế độ Exploded)
  const onMove = (e) => {
    if (exploded) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({
      x: ((e.clientX - r.left) / r.width - 0.5) * 10,
      y: ((e.clientY - r.top) / r.height - 0.5) * -8,
    })
  }

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
    setExploded((prev) => {
      const next = !prev
      if (next) setTilt({ x: 0, y: 0 })
      playTechClick()
      return next
    })
  }

  const hotspot = HOTSPOTS_DATA[activeHotspot]

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className="reveal relative flex min-h-svh flex-col justify-between overflow-hidden pt-20 pb-10"
    >
      {/* Background oversized kinetic brand watermarks */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="display-xl select-none text-charcoal/25 tracking-tighter">
          KINETIC
        </span>
      </div>

      {/* Grid line accents kỹ thuật */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Hero Header & Split Title */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-4 text-center">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          <p className="text-xs font-semibold tracking-[0.25em] text-paper/60 uppercase">
            {greeting} · SS26 PROTOTYPE
          </p>
        </div>

        <h1 className="display-xl mt-3 text-center transition-all duration-300">
          {(headline || ['MOVE', 'DIFFERENT'])[0]}<br />
          <span className="text-accent">{(headline || ['MOVE', 'DIFFERENT'])[1]}</span>
        </h1>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative z-10 mx-auto mt-2 flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4">
        {/* Controls HUD trên đầu giày */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          {/* Mode Switcher: 3D Tilt vs X-Ray Exploded */}
          <div className="flex items-center rounded border border-white/15 bg-charcoal/80 p-1 backdrop-blur-md">
            <button
              onClick={() => { if (exploded) toggleExploded() }}
              className={`px-3 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200 ${
                !exploded ? 'bg-accent text-ink' : 'text-paper/60 hover:text-paper'
              }`}
            >
              3D TILT
            </button>
            <button
              onClick={() => { if (!exploded) toggleExploded() }}
              className={`px-3 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200 ${
                exploded ? 'bg-accent text-ink' : 'text-paper/60 hover:text-paper'
              }`}
            >
              X-RAY ANATOMY
            </button>
          </div>

          {/* Colorway Switcher */}
          <div className="flex items-center gap-1.5 rounded border border-white/15 bg-charcoal/80 px-3 py-1.5 backdrop-blur-md">
            <span className="mr-1 text-[10px] font-mono tracking-widest text-paper/50">COLORWAY</span>
            {COLORWAYS.map((c) => (
              <button
                key={c.id}
                onClick={() => handleColorSelect(c.hex)}
                aria-label={`Chọn màu ${c.name}`}
                className={`h-5 w-5 rounded-full border transition-all duration-200 ${
                  selectedColor === c.hex
                    ? 'scale-125 border-white ring-2 ring-accent/60'
                    : 'border-white/30 hover:scale-110'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          {/* Audio FX Toggle */}
          <button
            onClick={toggleSound}
            className={`flex items-center gap-1.5 rounded border border-white/15 bg-charcoal/80 px-3 py-1.5 text-xs font-mono tracking-widest backdrop-blur-md transition-colors ${
              soundOn ? 'border-accent text-accent' : 'text-paper/50 hover:text-paper'
            }`}
            title={soundOn ? 'Âm thanh bật' : 'Âm thanh tắt'}
          >
            <span>{soundOn ? 'SFX: ON' : 'SFX: OFF'}</span>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${soundOn ? 'bg-accent animate-ping' : 'bg-paper/30'}`} />
          </button>
        </div>

        {/* Sneaker Protagonist Container with 3D tilt transform */}
        <div
          className="relative w-full max-w-[620px]"
          style={{
            transform: exploded
              ? 'none'
              : `perspective(1000px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`,
            transition: exploded ? 'transform 600ms var(--ease-out)' : 'transform 200ms ease-out',
          }}
        >
          <HeroShoe
            colorway={selectedColor}
            exploded={exploded}
            activeHotspot={activeHotspot}
            setActiveHotspot={(h) => { setActiveHotspot(h); playTechClick() }}
            onHotspotClick={(h) => { setActiveHotspot(h); playTechClick() }}
          />
        </div>

        {/* Interactive Hotspot HUD Detail Card */}
        {hotspot && !exploded && (
          <div className="mt-4 flex max-w-lg items-center gap-4 rounded border border-white/10 bg-charcoal/90 p-4 backdrop-blur-md animate-fadeIn">
            <div className="shrink-0 border-r border-white/10 pr-4">
              <span className="block font-mono text-[9px] tracking-widest text-accent">{hotspot.tag}</span>
              <span className="font-display text-sm font-bold text-paper">{hotspot.metric}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs font-bold text-paper">{hotspot.title}</p>
              <p className="mt-0.5 text-xs text-paper/60">{hotspot.desc}</p>
            </div>
          </div>
        )}

        {/* Top Product Recommendation Note */}
        {top && (
          <p className="mt-4 text-center text-xs tracking-wide text-paper/60">
            {matchScore(profile, top)?.pct}% MATCH CHO BẠN —{' '}
            <a href={`#/san-pham/${top.slug}`} className="text-accent underline underline-offset-4 hover:text-accent-hot">
              {top.name}
            </a>
          </p>
        )}
      </div>

      {/* Bottom Metadata & CTAs */}
      <div className="relative z-10 mx-auto mt-6 flex w-full max-w-7xl flex-wrap items-end justify-between gap-4 px-4 md:px-8">
        <div className="flex flex-col gap-1 text-[11px] font-mono tracking-widest text-paper/50">
          <span>DROP 004 // LIVE</span>
          <span className="text-accent font-semibold">LIMITED: 120 PAIRS</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onQuiz}
            className="border border-white/20 bg-ink-deep/60 px-6 py-3.5 text-xs font-bold tracking-widest text-paper/80 backdrop-blur-md transition-all duration-200 hover:border-accent hover:text-accent"
          >
            DISCOVER YOUR STYLE →
          </button>
          <a
            href="#drop"
            className="group flex items-center gap-2 border border-accent bg-accent px-8 py-3.5 text-xs font-bold tracking-widest text-ink transition-all duration-200 hover:bg-transparent hover:text-accent"
          >
            XEM DROP
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </a>
        </div>

        <div className="hidden font-mono text-[11px] tracking-widest text-paper/50 md:block">
          <span>SPEC: 285G · 8MM DROP</span>
        </div>
      </div>
    </section>
  )
}
