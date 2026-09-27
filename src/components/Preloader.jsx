import { useEffect, useRef, useState } from 'react'
// animejs tách chunk — chỉ dùng cho hiệu ứng rèm nếu chunk đã sẵn sàng
const loadAnime = () => import('animejs').then((m) => m.animate)

// Màn chào 1 lần mỗi SESSION, có trần thời gian, và bỏ qua được.
// Review end-user (mục 2/8): trước đây chạy lại mỗi lần điều hướng (vì mỗi link
// nội bộ là 1 lần reload document) → 2.2s thuế cho mỗi cú click, và người dùng
// không có cách nào thoát: không nút, không skip, chuột/phím đều vô tác dụng.
//
// Hai điều chỉnh ngoài "1 lần/session":
//  1. Số đếm chạy bằng rAF, KHÔNG chờ chunk animejs. Bản cũ chỉ bắt đầu đếm
//     trong .then() của dynamic import → chunk chưa về thì màn chào đứng im,
//     đo được ~2.2s trên dev server. Rèm có fallback CSS nếu chunk trễ >150ms.
//  2. Bấm/gõ phím/lăn chuột/chạm là thoát ngay.
const SEEN_KEY = 'kinetic:intro-seen'
const COUNT_MS = 600 // đếm 000→100
const HOLD_MS = 50
const LIFT_MS = 500 // kéo rèm lên
const ANIME_GRACE_MS = 150 // quá hạn này chưa có chunk → kéo rèm bằng CSS

function shouldSkip() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* private mode: bỏ qua */ }
}

export default function Preloader() {
  const [gone, setGone] = useState(shouldSkip)
  const numRef = useRef(null)
  const barRef = useRef(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (gone) return undefined
    markSeen() // đánh dấu ngay: điều hướng giữa lúc chạy thì không chạy lại
    let cancelled = false
    const skip = () => { cancelled = true; setGone(true) }
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    window.addEventListener('touchstart', skip, { passive: true })

    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const v = Math.min(1, (performance.now() - t0) / COUNT_MS)
      if (numRef.current) numRef.current.textContent = String(Math.round(v * 100)).padStart(3, '0')
      if (barRef.current) barRef.current.style.transform = `scaleX(${v})`
      if (v < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const lift = () => {
      if (cancelled) return
      const el = rootRef.current
      if (!el) { setGone(true); return }
      let lifted = false
      const cssLift = () => {
        if (cancelled || lifted) return
        lifted = true
        clearTimeout(grace)
        el.style.transition = `transform ${LIFT_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`
        el.style.transform = 'translateY(-100%)'
        setTimeout(() => setGone(true), LIFT_MS)
      }
      const grace = setTimeout(cssLift, ANIME_GRACE_MS)
      loadAnime().then((animate) => {
        if (cancelled || lifted) return
        clearTimeout(grace)
        lifted = true
        animate(el, {
          yPercent: -100,
          duration: LIFT_MS,
          ease: 'inOutExpo',
          onComplete: () => setGone(true),
        })
      }).catch(cssLift)
      // chốt an toàn: rèm không bao giờ được kẹt lại
      setTimeout(() => setGone(true), LIFT_MS + 200)
    }
    const hold = setTimeout(lift, COUNT_MS + HOLD_MS)

    return () => {
      cancelled = true
      clearTimeout(hold)
      cancelAnimationFrame(raf)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('wheel', skip)
      window.removeEventListener('touchstart', skip)
    }
  }, [gone])

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
