import { useEffect } from 'react'
import { animate, stagger } from 'animejs'

// Reveal on-scroll: children có [data-anime] bay lên stagger khi section vào viewport.
// Tôn trọng prefers-reduced-motion. Chạy 1 lần duy nhất mỗi section.
export function useAnimeReveal(ref, opts = {}) {
  const { y = 28, duration = 800, staggerMs = 70 } = opts
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const targets = el.querySelectorAll('[data-anime]')
    if (!targets.length) return undefined
    animate(targets, { opacity: 0, y, duration: 1 }) // trạng thái chờ, tránh flash
    let done = false
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done) return
        done = true
        animate(entry.target.querySelectorAll('[data-anime]'), {
          y: [y, 0],
          opacity: [0, 1],
          duration,
          delay: stagger(staggerMs),
          ease: 'outExpo',
        })
        io.disconnect()
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, y, duration, staggerMs])
}
