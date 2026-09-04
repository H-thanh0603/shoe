import { useEffect, useRef } from 'react'

// Nút hút nhẹ về con trỏ (desktop, không reduced-motion)
export function useMagnetic(strength = 18) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    if (window.matchMedia('(hover: none)').matches) return undefined
    let raf = 0
    const move = (e) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - (r.left + r.width / 2)
      const y = e.clientY - (r.top + r.height / 2)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate(${(x / r.width) * strength}px, ${(y / r.height) * strength}px)`
      })
    }
    const leave = () => {
      cancelAnimationFrame(raf)
      el.style.transition = 'transform 400ms cubic-bezier(0.16,1,0.3,1)'
      el.style.transform = 'translate(0,0)'
      setTimeout(() => { el.style.transition = '' }, 400)
    }
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', leave)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseleave', leave)
    }
  }, [strength])
  return ref
}
