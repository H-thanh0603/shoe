import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Giày procedural — không cần file model ngoài.
// Side profile extrude: đế + thân, chi tiết carbon/laces/swoosh theo colorway.
function soleShape() {
  const s = new THREE.Shape()
  s.moveTo(-2.6, 0)
  s.quadraticCurveTo(-2.9, 0.55, -2.2, 0.62) // gót bo
  s.lineTo(1.6, 0.62)
  s.quadraticCurveTo(2.7, 0.6, 2.75, 0.25) // mũi vuốt
  s.quadraticCurveTo(2.78, 0.05, 2.3, 0)
  s.lineTo(-2.6, 0)
  return s
}

function upperShape() {
  const s = new THREE.Shape()
  s.moveTo(-2.2, 0.6)
  s.quadraticCurveTo(-2.3, 1.7, -1.2, 1.85) // cổ giày
  s.quadraticCurveTo(-0.4, 1.95, 0.3, 1.35) // mu bàn chân xuống mũi
  s.quadraticCurveTo(1.4, 0.9, 2.35, 0.62)
  s.lineTo(-2.2, 0.6)
  return s
}

function buildShoe(colorway) {
  const g = new THREE.Group()
  const accent = new THREE.Color(colorway)

  const matSole = new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.55 })
  const matOut = new THREE.MeshStandardMaterial({ color: accent.clone(), roughness: 0.4 })
  const matUpper = new THREE.MeshStandardMaterial({ color: '#d7d7dc', roughness: 0.85 })
  const matDark = new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.5, metalness: 0.35 })
  const matLace = new THREE.MeshStandardMaterial({ color: '#f4f4f5', roughness: 0.9 })

  // Đế giữa + đế ngoài (line accent) + tấm carbon
  const mid = new THREE.Mesh(
    new THREE.ExtrudeGeometry(soleShape(), { depth: 1.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 24 }),
    matSole,
  )
  mid.position.z = -0.55
  const out = new THREE.Mesh(
    new THREE.ExtrudeGeometry(soleShape(), { depth: 1.14, bevelEnabled: false, curveSegments: 12 }),
    matOut,
  )
  out.scale.set(1.0, 0.28, 1.0)
  out.position.set(0, -0.16, -0.57)
  const carbon = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 1.0), matDark)
  carbon.position.set(-0.2, 0.32, 0)
  carbon.rotation.z = 0.02

  // Thân giày
  const upper = new THREE.Mesh(
    new THREE.ExtrudeGeometry(upperShape(), { depth: 0.95, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.24, bevelSegments: 4, curveSegments: 24 }),
    matUpper,
  )
  upper.position.set(0, 0.55, -0.475)

  // Swoosh slash 2 bên hông
  const slashShape = new THREE.Shape()
  slashShape.moveTo(-1.9, 0.35)
  slashShape.quadraticCurveTo(0, 0.75, 2.0, 0.35)
  slashShape.lineTo(2.0, 0.15)
  slashShape.quadraticCurveTo(0, 0.55, -1.9, 0.15)
  slashShape.lineTo(-1.9, 0.35)
  const slashGeo = new THREE.ExtrudeGeometry(slashShape, { depth: 0.02, bevelEnabled: false })
  const slashL = new THREE.Mesh(slashGeo, matOut)
  slashL.position.set(0.1, 0.75, 0.62)
  const slashR = slashL.clone()
  slashR.position.z = -0.64

  // Dây giày: 4 thanh ngang trên mu
  const laceGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.0, 10)
  for (let i = 0; i < 4; i++) {
    const lace = new THREE.Mesh(laceGeo, matLace)
    lace.rotation.x = Math.PI / 2
    lace.rotation.z = 0.35 - i * 0.06
    lace.position.set(-1.05 + i * 0.33, 2.0 - i * 0.17, 0)
    lace.scale.z = 1
    g.add(lace)
  }

  // Gót + lưỡi gà
  const heel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.9), matDark)
  heel.position.set(-2.15, 1.35, 0)
  heel.rotation.z = 0.12
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), matUpper)
  tongue.position.set(-1.15, 2.05, 0)
  tongue.rotation.z = -0.25

  g.add(mid, out, carbon, upper, slashL, slashR, heel, tongue)
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return { group: g, accentMats: [matOut] }
}

export default function ShoeViewer3D({ colorway = '#d43a2a', onReady }) {
  const mountRef = useRef(null)
  const apiRef = useRef(null)

  // đổi màu live không rebuild geometry
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const c = new THREE.Color(colorway)
    api.accentMats.forEach((m) => m.color.copy(c))
    api.glow.material.color.copy(c)
  }, [colorway])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0.4, 2.2, 8.2)
    camera.lookAt(0, 1.0, 0)

    scene.add(new THREE.HemisphereLight('#ffffff', '#1a1a1e', 1.1))
    const key = new THREE.DirectionalLight('#ffffff', 2.2)
    key.position.set(4, 7, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#8ab4ff', 1.1)
    rim.position.set(-6, 3, -4)
    scene.add(rim)

    // sàn bóng đổ + glow theo colorway
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 48),
      new THREE.MeshBasicMaterial({ color: colorway, transparent: true, opacity: 0.16, depthWrite: false }),
    )
    glow.rotation.x = -Math.PI / 2
    glow.position.y = 0.01
    scene.add(glow)

    const { group: shoe, accentMats } = buildShoe(colorway)
    shoe.position.y = 0.35
    shoe.rotation.y = -0.5
    scene.add(shoe)
    apiRef.current = { accentMats, glow }

    // tương tác: kéo xoay + auto-xoay khi rảnh
    let targetY = shoe.rotation.y
    let targetX = 0
    let dragging = false
    let lastX = 0
    let lastY = 0
    let idleAt = performance.now()
    const down = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; mount.setPointerCapture?.(e.pointerId) }
    const move = (e) => {
      if (!dragging) return
      targetY += (e.clientX - lastX) * 0.008
      targetX = THREE.MathUtils.clamp(targetX + (e.clientY - lastY) * 0.004, -0.35, 0.35)
      lastX = e.clientX; lastY = e.clientY
      idleAt = performance.now()
    }
    const up = () => { dragging = false; idleAt = performance.now() }
    mount.style.touchAction = 'pan-y'
    mount.addEventListener('pointerdown', down)
    mount.addEventListener('pointermove', move)
    mount.addEventListener('pointerup', up)
    mount.addEventListener('pointercancel', up)

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    let raf = 0
    let t = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      t += 0.016
      if (!dragging && !reduceMotion && performance.now() - idleAt > 2500) targetY += 0.0035
      shoe.rotation.y += (targetY - shoe.rotation.y) * 0.08
      shoe.rotation.x += (targetX - shoe.rotation.x) * 0.08
      if (!reduceMotion) shoe.position.y = 0.35 + Math.sin(t * 1.4) * 0.07
      renderer.render(scene, camera)
    }
    tick()
    onReady?.()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mount.removeEventListener('pointerdown', down)
      mount.removeEventListener('pointermove', move)
      mount.removeEventListener('pointerup', up)
      mount.removeEventListener('pointercancel', up)
      scene.traverse((o) => { if (o.isMesh) o.geometry.dispose() })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={mountRef} className="h-[300px] w-full cursor-grab active:cursor-grabbing md:h-[380px]" aria-label="Xem giày 3D — kéo để xoay" role="img" />
}
