import { useEffect } from 'react'

// Reveal-on-scroll for sections using the `.reveal` class:
// adds `is-in` when the section enters the viewport.
// Fail-safe: never leave a section stuck at opacity:0 forever.
// - IntersectionObserver (when available) + scroll/resize listener fallback + mount-time check.
// - If the section is already in the viewport when the effect runs
//   (e.g. hash navigation like #drop) -> reveal immediately.
export function useScrollReveal(ref, { threshold = 0.1, rootMargin = '0px 0px 80px 0px' } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let done = false
    let io = null

    const isVisible = () => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight
      return r.top <= vh && r.bottom >= 0 && r.top < r.bottom
    }
    // onScroll is declared before reveal: reveal() (called by the mount check
    // below) must never hit the temporal-dead-zone of a later const.
    const onScroll = () => { if (!done && isVisible()) reveal() }
    const reveal = () => {
      if (done) return
      done = true
      try { el.classList.add('is-in') } catch { /* noop */ }
      if (io) { try { io.disconnect() } catch { /* noop */ } }
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }

    // Already in the viewport from the start -> reveal immediately (never wait for scroll).
    if (isVisible()) { reveal(); return undefined }

    try {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) reveal() }, { threshold, rootMargin })
      io.observe(el)
    } catch { /* IntersectionObserver unsupported -> rely on the scroll listener */ }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    // Safety net: if we are still not revealed after 2s but are in the viewport
    // (observer missed it somehow) -> reveal anyway.
    const timer = setTimeout(() => { if (!done && isVisible()) reveal() }, 2000)

    return () => {
      if (io) { try { io.disconnect() } catch { /* noop */ } }
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      clearTimeout(timer)
    }
  }, [ref, threshold, rootMargin])
}