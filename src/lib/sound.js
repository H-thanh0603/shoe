// Web Audio API micro-sound generator — không cần load file mp3 bên ngoài.
// Âm thanh cơ học/sci-fi cực nhẹ phục vụ micro-interactions (§DESIGN.md §63).

let audioCtx = null

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext) audioCtx = new AudioContext()
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export function isAudioMuted() {
  try {
    return localStorage.getItem('kinetic_sound') !== '1'
  } catch {
    return true
  }
}

export function setAudioEnabled(enabled) {
  try {
    localStorage.setItem('kinetic_sound', enabled ? '1' : '0')
  } catch {}
}

export function playTechClick() {
  if (isAudioMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.04)

  gain.gain.setValueAtTime(0.08, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.04)
}

export function playTechHum() {
  if (isAudioMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(160, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.08)

  gain.gain.setValueAtTime(0.06, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.08)
}

export function playSwitch() {
  if (isAudioMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(520, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.06)

  gain.gain.setValueAtTime(0.05, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.06)
}

// Thả vào giỏ — "clink" kim loại: 2 xung detune + noise chạm ngắn, decay nhanh.
export function playDropToCart() {
  if (isAudioMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const t = ctx.currentTime
  for (const [f, dt, g] of [[1244, 0, 0.07], [1864, 0.012, 0.04]]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(f, t + dt)
    gain.gain.setValueAtTime(g, t + dt)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.09)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t + dt)
    osc.stop(t + dt + 0.1)
  }
  // lớp noise "tick" 8ms cho cảm giác va chạm thật
  const len = Math.floor(ctx.sampleRate * 0.008)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  const ng = ctx.createGain()
  ng.gain.value = 0.05
  src.buffer = buf
  src.connect(ng)
  ng.connect(ctx.destination)
  src.start(t)
}

// Tick đếm ngược drop — pitch tăng gần hết giờ (Drop.jsx truyền 0..1).
export function playTick(urgency = 0) {
  if (isAudioMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(660 + urgency * 550, ctx.currentTime)
  gain.gain.setValueAtTime(0.035, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.05)
}

// Mở khoá (achievement/secret) — arpeggio 3 nốt đi lên.
export function playUnlock() {
  if (isAudioMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const t = ctx.currentTime
  ;[523.25, 659.25, 783.99].forEach((f, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(f, t + i * 0.07)
    gain.gain.setValueAtTime(0.055, t + i * 0.07)
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.14)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t + i * 0.07)
    osc.stop(t + i * 0.07 + 0.15)
  })
}
