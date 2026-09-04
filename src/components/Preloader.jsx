import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'

// Màn chào 1 lần mỗi load: đếm 0→100 rồi kéo rèm lên
export default function Preloader() {
  const [gone, setGone] = useState(false)
  const numRef = useRef(null)
  const barRef = useRef(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGone(true)
      return undefined
    }
    const counter = { v: 0 }
    const a = animate(counter, {
      v: 100,
      duration: 1100,
      ease: 'inOutExpo',
      onUpdate: () => {
        if (numRef.current) numRef.current.textContent = String(Math.round(counter.v)).padStart(3, '0')
        if (barRef.current) barRef.current.style.transform = `scaleX(${counter.v / 100})`
      },
    })
    const t = setTimeout(() => {
      if (!rootRef.current) { setGone(true); return }
      animate(rootRef.current, {
        yPercent: -100,
        duration: 800,
        ease: 'inOutExpo',
        onComplete: () => setGone(true),
      })
    }, 1250)
    return () => { a?.revert?.(); clearTimeout(t) }
  }, [])

  if (gone) return null
  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] flex flex-col justify-between bg-ink-deep p-6 md:p-10" aria-hidden="true">
      <div className="flex items-center justify-between font-mono text-[11px] tracking-widest text-paper/50">
        <span>KINETIC<span className="text-accent">.</span></span>
        <span>SS26 // LOADING ARCHIVE</span>
      </div>
      <div className="flex items-end justify-between gap-6">
        <p ref={numRef} className="display-xl text-paper tabular-nums">000</p>
        <p className="mb-3 hidden font-mono text-[11px] tracking-widest text-paper/40 md:block">
          NITRO FOAM · CARBON PLATE · RIPSTOP
        </p>
      </div>
      <div className="h-px w-full bg-white/10">
        <div ref={barRef} className="h-full w-full origin-left bg-accent" style={{ transform: 'scaleX(0)' }} />
      </div>
    </div>
  )
}
