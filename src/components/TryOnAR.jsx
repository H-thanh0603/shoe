import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildShoe } from './ShoeViewer3D.jsx'
import { playSwitch, playTick } from '../lib/sound.js'
import { haptic } from '../lib/haptic.js'
import { track } from '../lib/track.js'

// Try-on AR nhẹ (feature #1): webcam làm nền + giày procedural 3D xoay theo chuột,
// pinch/wheel scale + drag vị trí. KHÔNG track chân — overlay thủ công, zero deps mới.
// Điều kiện: getUserMedia cần https hoặc localhost.
const MAX_DIM = 640

function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop())
}

export default function TryOnAR({ colors = ['#d43a2a'], onClose }) {
  const videoRef = useRef(null)
  const mountRef = useRef(null)
  const stateRef = useRef({
    scale: 1, pos: { x: 0, y: -0.4 }, spin: 0, dragging: false, lastX: 0, lastY: 0,
    pinch: null,
  })
  const [err, setErr] = useState(null)
  const [phase, setPhase] = useState('starting') // starting | live | error

  // camera stop khi unmount
  useEffect(() => () => stopStream(videoRef.current?.srcObject), [])

  // khởi động camera + dựng scene một lần
  useEffect(() => {
    let stream
    let dead = false

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        if (dead) { stopStream(s); return }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        setPhase('live')
      })
      .catch((e) => {
        if (!dead) { setErr(e.name === 'NotAllowedError' ? 'Bạn chưa cho phép truy cập camera.' : 'Không mở được camera trên trình duyệt này.'); setPhase('error') }
      })

    const mount = mountRef.current
    if (!mount) return () => { dead = true; stopStream(stream) }
    const w = () => Math.min(mount.clientWidth, MAX_DIM)
    const h = () => mount.clientHeight || Math.round(w() * 0.75)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, w() / h(), 0.1, 100)
    camera.position.set(0, 0.6, 7)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(w(), h())
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'

    // ánh sáng đôi ngang hông — tự nhiên hơn cho overlay
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404046, 1.35))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2.5, 4, 4)
    scene.add(key)

    const { group } = buildShoe(colors[0] || '#d43a2a')
    group.rotation.y = Math.PI / 4
    scene.add(group)

    const st = stateRef.current
    const loop = () => {
      if (dead) return
      st.spin = Math.min(Math.max(st.spin, -0.9), 0.9)
      group.rotation.y = Math.PI / 4 + st.spin
      group.position.set(st.pos.x, st.pos.y, 0)
      group.scale.setScalar(st.scale)
      renderer.render(scene, camera)
      requestAnimationFrame(loop)
    }
    loop()

    // resize theo container
    const ro = new ResizeObserver(() => {
      renderer.setSize(w(), h())
      camera.aspect = w() / h()
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    // drag di chuyển, pinch/wheel scale
    const onDown = (e) => {
      st.dragging = true
      st.lastX = e.clientX ?? 0
      st.lastY = e.clientY ?? 0
      playTick(0.4)
      haptic(8)
    }
    const onMove = (e) => {
      if (!st.dragging) return
      const clientX = e.clientX ?? 0
      const clientY = e.clientY ?? 0
      st.pos.x += (clientX - st.lastX) / w() * 6
      st.pos.y -= (clientY - st.lastY) / h() * 4
      st.lastX = clientX
      st.lastY = clientY
    }
    const onUp = () => { st.dragging = false }
    const onWheel = (e) => {
      e.preventDefault()
      st.scale = Math.min(2.2, Math.max(0.5, st.scale * (e.deltaY > 0 ? 0.92 : 1.08)))
    }
    const onTouch = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        if (st.pinch) st.scale = Math.min(2.2, Math.max(0.5, st.scale * (d / st.pinch)))
        st.pinch = d
      }
    }
    const onTouchEnd = () => { st.pinch = null }
    const el = renderer.domElement
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouch, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      dead = true
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouch)
      el.removeEventListener('touchend', onTouchEnd)
      renderer.dispose()
      if (el.parentNode === mount) mount.removeChild(el)
      stopStream(stream)
    }
  }, [colors])

  const shot = useCallback(() => {
    const v = videoRef.current
    const mount = mountRef.current
    if (!v || !mount) return
    try {
      const out = document.createElement('canvas')
      out.width = 960
      out.height = 720
      const ctx = out.getContext('2d')
      // mirror khớp video selfie
      ctx.translate(out.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(v, 0, 0, out.width, out.height)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const gl = mount.querySelector('canvas')
      if (gl) ctx.drawImage(gl, 0, 0, out.width, out.height)
      playSwitch()
      haptic([10, 30, 10])
      track('ar_snapshot')
      const a = document.createElement('a')
      a.href = out.toDataURL('image/png')
      a.download = 'kinetic-tryon.png'
      a.click()
    } catch {
      // canvas taint hay WebGL mất context — bỏ qua
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[80] bg-ink/95 backdrop-blur-sm" role="dialog" aria-label="Thử giày AR">
      <div className="mx-auto flex h-full max-w-3xl flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-xs font-bold tracking-widest text-accent">TRY-ON AR · KÉO ĐỂ DI CHUYỂN · LĂN CUỘN ĐỂ SCALE</p>
          <button onClick={onClose} aria-label="Đóng try-on" className="text-sm tracking-widest text-paper/70 transition-colors hover:text-accent">ĐÓNG ✕</button>
        </div>

        <div className="relative flex-1 overflow-hidden border border-white/10 bg-black">
          {/* webcam mirrored + đè nhòe nhẹ để 3D nổi */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-90"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-ink/20" />
          <div ref={mountRef} className="absolute inset-0" />

          {phase !== 'live' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-mono text-xs tracking-widest text-paper/70">
                {phase === 'starting' ? 'ĐANG MỞ CAMERA…' : err}
              </p>
            </div>
          )}

          {phase === 'live' && (
            <button
              onClick={shot}
              className="absolute bottom-4 right-4 border border-accent bg-ink/80 px-4 py-2 font-display text-xs font-bold tracking-widest text-accent backdrop-blur-sm transition-colors hover:bg-accent hover:text-ink"
            >
              ⬇ LƯU ẢNH
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
