import { useMemo, useState } from 'react'
import { computeProfile, saveProfile } from '../store/profile.js'
import { track } from '../lib/track.js'

// Shoe Personality Quiz (DESIGN.md §44-45) — 7 câu, 1 câu/step, không bắt đăng ký.
// Kết quả = Shoe Profile → localStorage → website biến đổi theo profile.
const ACCENTS = [
  { key: 'red', hex: '#d43a2a', label: 'ĐỎ KINETIC' },
  { key: 'lime', hex: '#9be15d', label: 'XANH ACID' },
  { key: 'ice', hex: '#5db4ff', label: 'XANH BĂNG' },
  { key: 'magenta', hex: '#d94fd9', label: 'TÍM NEON' },
]

const STEPS = [
  {
    key: 'purpose', q: 'BẠN MUA GIÀY CHỦ YẾU ĐỂ?', sub: 'STEP 01 — MỤC ĐÍCH',
    opts: [
      { v: 'running', label: 'CHẠY', d: 'Tập luyện, đường dài, tempo' },
      { v: 'street', label: 'STREET', d: 'Phối đồ, đi chơi, biểu tượng' },
      { v: 'court', label: 'BÓNG RỔ', d: 'Thi đấu, grip, bật nhảy' },
      { v: 'daily', label: 'DAILY', d: 'Đi học, đi làm, đứng cả ngày' },
      { v: 'trail', label: 'OUTDOOR', d: 'Núi rừng, bùn, đá ướt' },
    ],
  },
  {
    key: 'style', q: 'PHONG CÁCH CỦA BẠN?', sub: 'STEP 02 — PHONG CÁCH',
    opts: [
      { v: 'minimal', label: 'MINIMAL', d: 'Sạch, ít chi tiết, trắng đen' },
      { v: 'bold', label: 'BOLD', d: 'Màu mạnh, nổi giữa đám đông' },
      { v: 'retro', label: 'RETRO', d: 'Thập niên cũ, suede, dáng cổ điển' },
      { v: 'future', label: 'FUTURE', d: 'Kỹ thuật, tối màu, phản quang' },
    ],
  },
  {
    key: 'colors', q: 'BẠN THÍCH MÀU NÀO?', sub: 'STEP 03 — MÀU SẮC', multi: 2, type: 'color',
    opts: [
      { v: '#0a0a0a', label: 'ĐEN' }, { v: '#e8e6e1', label: 'TRẮNG' },
      { v: '#d43a2a', label: 'ĐỎ' }, { v: '#1a5fb4', label: 'XANH' },
      { v: '#8a8a8f', label: 'XÁM' }, { v: '#d9a441', label: 'GUM/VÀNG' },
    ],
  },
  {
    key: 'budget', q: 'NGÂN SÁCH CỦA BẠN?', sub: 'STEP 04 — NGÂN SÁCH',
    opts: [
      { v: 'under-2m', label: '< 2 TRIỆU', d: 'Giá tốt, vẫn chất' },
      { v: '2-4m', label: '2 – 4 TRIỆU', d: 'Dòng chính stream' },
      { v: '4m+', label: '4 TRIỆU+', d: 'Flagship, không thỏa hiệp' },
    ],
  },
  {
    key: 'brands', q: 'CHỌN THƯƠNG HIỆU YÊU THÍCH', sub: 'STEP 05 — THƯƠNG HIỆU', multi: 2,
    opts: ['NIKE', 'ADIDAS', 'NEW BALANCE', 'ASICS', 'PUMA', 'KINETIC'].map((b) => ({ v: b, label: b })),
  },
  {
    key: 'accent', q: 'CHỌN MÀU NHẤN CỦA WEBSITE', sub: 'STEP 06 — CÁ NHÂN HÓA', type: 'color',
    opts: ACCENTS.map(({ key, hex, label }) => ({ v: key, label, hex })),
  },
  {
    key: 'priority', q: 'ĐIỀU GÌ QUAN TRỌNG NHẤT?', sub: 'STEP 07 — ƯU TIÊN',
    opts: [
      { v: 'comfort', label: 'ÊM ÁI', d: 'Đứng 8 tiếng không mỏi' },
      { v: 'speed', label: 'TỐC ĐỘ', d: 'Nhẹ, bung lực, phản xạ' },
      { v: 'looks', label: 'DIỆN MẠO', d: 'Phải đẹp trước mọi thứ' },
      { v: 'tough', label: 'BỀN BỈ', d: 'Mặc xấu, dùng lâu' },
    ],
  },
]

// map answers các step multi/cột riêng về shape computeProfile cần
function toAnswers(state) {
  return {
    purpose: state.purpose, style: state.style, priority: state.priority,
    colors: state.colors || [], brands: state.brands || [],
    budget: state.budget, accent: state.accent || 'red',
  }
}

function OptButton({ opt, selected, onClick, color }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex flex-col items-start gap-1 border p-4 text-left transition-colors duration-200
        ${selected ? 'border-accent bg-accent/10' : 'border-white/15 hover:border-accent/60'}`}
    >
      {color ? (
        <span className="h-8 w-8 rounded-full border border-white/30" style={{ background: opt.hex }} aria-hidden="true" />
      ) : null}
      <span className="font-display text-lg font-bold tracking-wide text-paper">{opt.label}</span>
      {opt.d && <span className="text-xs text-paper/50">{opt.d}</span>}
    </button>
  )
}

export default function Quiz({ onClose }) {
  const [step, setStep] = useState(0)
  const [ans, setAns] = useState({})
  const cur = STEPS[step]
  const isResult = step >= STEPS.length

  const profile = useMemo(() => (isResult ? computeProfile(toAnswers(ans)) : null), [isResult, ans])

  // chọn option: multi cho phép tối đa `multi` chọn, single auto next
  const pick = (v) => {
    if (cur.multi) {
      const list = ans[cur.key] || []
      const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(-cur.multi)
      setAns({ ...ans, [cur.key]: next })
    } else {
      setAns({ ...ans, [cur.key]: v })
      setStep(step + 1)
    }
  }

  const finish = () => {
    saveProfile(profile)
    track('quiz_complete', null, { purpose: profile.purpose, accent: profile.accent })
    onClose()
  }

  // ---- result screen ----
  if (isResult) {
    const prefs = Object.entries(profile.prefs).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])
    return (
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink px-4 py-20" role="dialog" aria-label="Kết quả Shoe Profile">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-semibold tracking-widest text-paper/50">SHOE PROFILE CỦA BẠN</p>
          <h2 className="display-l mt-4 text-paper">
            YOUR<span className="text-accent"> PROFILE</span>
          </h2>

          <div className="mt-10 flex flex-col gap-4">
            {prefs.map(([k, n]) => (
              <div key={k}>
                <div className="flex justify-between text-xs tracking-widest text-paper/60">
                  <span>{{ performance: 'PERFORMANCE', comfort: 'COMFORT', style: 'FASHION', durability: 'DURABILITY', daily: 'DAILY' }[k]}</span>
                  <span className="text-paper">{n}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full bg-charcoal-2"><div className="h-full bg-accent" style={{ width: `${n}%` }} /></div>
              </div>
            ))}
          </div>

          {profile.colors.length > 0 && (
            <div className="mt-10">
              <p className="text-xs font-semibold tracking-widest text-paper/50">MÀU CỦA BẠN</p>
              <div className="mt-3 flex gap-3">
                {profile.colors.map((c) => <span key={c} className="h-8 w-8 rounded-full border border-white/30" style={{ background: c }} />)}
              </div>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button onClick={finish} className="bg-paper px-8 py-4 text-sm font-bold tracking-widest text-ink transition-colors duration-200 hover:bg-accent">
              BẮT ĐẦU MUA →
            </button>
            <button onClick={() => { setAns({}); setStep(0) }} className="border border-white/15 px-8 py-4 text-sm font-medium tracking-widest text-paper/70 transition-colors duration-200 hover:border-accent hover:text-accent">
              LÀM LẠI
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- question screen ----
  const selected = (v) => (ans[cur.key] || []).includes(v) || ans[cur.key] === v

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink px-4 py-20" role="dialog" aria-label="Shoe Personality Quiz">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-widest text-paper/40">{cur.sub}</p>
          <button onClick={onClose} className="text-sm tracking-widest text-paper/70 transition-colors hover:text-accent">ĐÓNG ✕</button>
        </div>

        <div className="mt-6 flex gap-1" aria-hidden="true">
          {STEPS.map((_s, i) => <span key={i} className={`h-1 flex-1 ${i <= step ? 'bg-accent' : 'bg-charcoal-2'}`} />)}
        </div>

        <h2 className="display-l mt-10 text-paper">{cur.q}</h2>

        <div className={`mt-10 grid gap-3 ${cur.opts.length > 4 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {cur.opts.map((o) => (
            <OptButton key={o.v} opt={o} color={cur.type === 'color'} selected={selected(o.v)} onClick={() => pick(o.v)} />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="text-sm tracking-widest text-paper/50 transition-colors hover:text-accent disabled:opacity-0">
            ← TRƯỚC
          </button>
          {cur.multi && (
            <button onClick={() => setStep(step + 1)} disabled={(ans[cur.key] || []).length === 0}
              className="bg-paper px-6 py-3 text-sm font-bold tracking-widest text-ink transition-colors duration-200 hover:bg-accent disabled:opacity-30">
              TIẾP →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
