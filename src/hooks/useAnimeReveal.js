import { useEffect } from 'react'
import { animate, stagger } from 'animejs'

// Reveal on-scroll: children có [data-anime] bay lên stagger khi section vào viewport.
// Tôn trọng prefers-reduced-motion. CHẠY 1 LẦN DUY NHẤT mỗi section.
// Fail-safe: không bao giờ để content kẹt opacity:0 (black box).
// - Vừa đánh dấu section `is-in` vừa animate children; hỗ trợ nhiều cơ chế (observe + scroll + mount-check + timer).
// - Nếu animejs/lệnh animate lỗi → content vẫn hiện (không giấu vĩnh viễn).
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
      try {
        if (targets.length) {
          if (!reduced) {
            animate(targets, { y: [y, 0], opacity: [0, 1], duration, delay: stagger(staggerMs), ease: 'outExpo' })
          } else {
            // reduced-motion: xoá inline từ animation để content hiện ngay
            targets.forEach((t) => { t.style.opacity = ''; t.style.transform = '' })
          }
        }
      } catch { /* nếu animate lỗi → content vẫn còn đó (đã gỡ ẩn) */ }
      cleanup()
    }

    // 1) đã trong viewport ngay lúc mount (vd hash-navigate, page ngắn) → reveal luôn
    if (isVisible()) { reveal(); return cleanup }

    // 2) thiết lập trạng thái "chờ" cho children [data-anime]
    if (targets.length && !reduced) {
      try { animate(targets, { opacity: 0, y, duration: 1 }) } catch { /* lỗi thì không cần ẩn */ }
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
