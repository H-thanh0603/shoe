import { useEffect } from 'react'
// animejs tách chunk riêng — reveal fail-safe giữ nguyên: lỗi/thiếu lib → content hiện
export function useAnimeReveal(ref, opts = {}) {
  const { y = 28, duration = 800, staggerMs = 70 } = opts
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    let reduced = false
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        reduced = !!window.matchMedia('(prefers-reduced-motion: reduce)').matches
      }
    } catch { /* noop */ }

    const targets = el.querySelectorAll('[data-anime]')
    const cleanups = []
    let revealed = false

    const cleanup = () => { cleanups.forEach((f) => { try { f() } catch { /* noop */ } }); cleanups.length = 0 }
    const isVisible = () => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight
      return r.top <= vh && r.bottom >= 0 && r.top < r.bottom
    }

    const reveal = () => {
      if (revealed) return
      revealed = true
      try { el.classList.add('is-in') } catch { /* noop */ }
      if (targets.length && !reduced) {
        // animejs chunk async — nếu đang chờ, content vẫn hiện nhờ is-in
        import('animejs').then(({ animate, stagger }) => {
          animate(targets, { y: [y, 0], opacity: [0, 1], duration, delay: stagger(staggerMs), ease: 'outExpo' })
        }).catch(() => {
          targets.forEach((t) => { t.style.opacity = ''; t.style.transform = '' })
        })
      } else if (targets.length) {
        // reduced-motion: xoá inline từ animation để content hiện ngay
        targets.forEach((t) => { t.style.opacity = ''; t.style.transform = '' })
      }
      cleanup()
    }

    // 1) đã trong viewport ngay lúc mount (vd hash-navigate, page ngắn) → reveal luôn
    if (isVisible()) { reveal(); return cleanup }

    // 2) thiết lập trạng thái "chờ" cho children [data-anime] — CSS var, không cần lib
    if (targets.length && !reduced) {
      targets.forEach((t) => { t.style.opacity = '0'; t.style.transform = `translateY(${y}px)` })
    }

    // 3) IntersectionObserver (nếu hỗ trợ)
    try {
      const io = new IntersectionObserver(([e]) => { if (!revealed && e.isIntersecting) reveal() }, { threshold: 0.05, rootMargin: '0px 0px 120px 0px' })
      io.observe(el)
      cleanups.push(() => io.disconnect())
    } catch { /* không hỗ trợ → scroll fallback */ }

    // 4) scroll/resize fallback
    const onScroll = () => { if (!revealed && isVisible()) reveal() }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    cleanups.push(() => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) })

    // 5) an toàn: nếu đã trong viewport mà observer/scroll lỡ → reveal sau 1.5s
    const timer = setTimeout(() => { if (!revealed && isVisible()) reveal() }, 1500)
    cleanups.push(() => clearTimeout(timer))

    return cleanup
  }, [ref, y, duration, staggerMs])
}
