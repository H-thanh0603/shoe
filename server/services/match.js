// Match engine — server-side port của src/lib/match.js (quiz client).
// Cùng công thức prefs + matchScore để agent recommend KHÁC kết quả web app.
// Giữ sync 2 chiều khi đổi một trong hai file.
//
// Client: quiz 3 bước → computeProfile() → matchScore(profile, product).
// Server (tool recommend_products): input rút gọn từ agent → buildPrefs() → matchScore.

const DNA_KEYS = [
  ['performance', 'perf'],
  ['comfort', 'comfort'],
  ['style', 'style'],
  ['durability', 'durability'],
  ['daily', 'daily'],
]
const LABELS = { performance: 'PERFORMANCE', comfort: 'COMFORT', style: 'FASHION', durability: 'DURABLE', daily: 'DAILY' }
const LABEL_PURPOSE = { running: 'chạy', street: 'streetwear', court: 'bóng rổ', daily: 'đi hằng ngày', trail: 'outdoor' }
const BUDGET = { 'under-2m': 2000000, '2-4m': 4000000, '4m+': Infinity }

// purpose + priorities (mỗi trục +25, cap 100 — cùng trọng số câu "ưu tiên" của quiz)
// → prefs shape giống computeProfile: agent chỉ cần mô tả nhu cầu bằng ngôn ngữ tự nhiên.
function buildPrefs({ purpose, priorities = [] } = {}) {
  const prefs = { performance: 0, comfort: 0, style: 0, durability: 0, daily: 0 }
  const P = { // purpose → điểm trục (giống quiz STEP 01)
    running: { performance: 45, daily: 10 },
    street: { style: 40, daily: 10 },
    court: { performance: 30, durability: 20 },
    daily: { daily: 30, comfort: 20 },
    trail: { durability: 35, performance: 15 },
  }[purpose] || {}
  const Q = { // trục ưu tiên → +25 (giống câu "điều gì quan trọng nhất")
    performance: { performance: 25 },
    comfort: { comfort: 25 },
    style: { style: 25 },
    durability: { durability: 25 },
    daily: { daily: 25 },
  }
  for (const p of priorities) {
    for (const k in (Q[p] || {})) prefs[k] = Math.min(100, prefs[k] + Q[p][k])
  }
  for (const k in P) prefs[k] = Math.min(100, prefs[k] + P[k])
  return prefs
}

// Port y hệt matchScore client — pct + reasons giải thích được (agent đọc reason
// để trả lời người dùng "vì sao hết cái này").
function matchScore(profile, product) {
  const prefs = profile?.prefs
  if (!prefs || product?.perf == null) return null

  let sum = 0, wsum = 0, top = null
  for (const [k, pk] of DNA_KEYS) {
    const w = prefs[k] || 0
    if (w > 0) { sum += w * (product[pk] ?? 0); wsum += w; if (!top || w > prefs[top]) top = k }
  }
  let pct = wsum ? Math.round(sum / wsum) : 50
  const reasons = []

  if (profile.purpose && product.purpose === profile.purpose) { pct = Math.min(100, pct + 8); reasons.push(`Mục đích ${LABEL_PURPOSE[profile.purpose]}`) }
  if (profile.brands?.includes(product.brand)) { pct = Math.min(100, pct + 4); reasons.push('Thương hiệu khách chọn') }
  if (profile.colors?.some((c) => product.colors?.includes(c))) { pct = Math.min(100, pct + 4); reasons.push('Có màu khách chọn') }

  const cap = BUDGET[profile.budget]
  if (cap != null && product.price_vnd <= cap) reasons.push('Phù hợp ngân sách')
  if (top) reasons.unshift(top === 'style' ? 'Ưu tiên diện mạo' : `Ưu tiên ${LABELS[top].toLowerCase()}`)

  return { pct, reasons: reasons.length <= 4 ? reasons : [reasons[0], ...reasons.slice(1, -1).slice(0, 2), reasons.at(-1)] }
}

// Trục khách CẦN (prefs >= 25) mà đôi này YẾU (<60) — agent cảnh báo trade-off
// thật thay vì khen hết ("không hợp chạy cường độ cao" thay vì im lặng).
function topWeakAxis(prefs, product) {
  const AXIS_VN = { performance: 'chạy/bứt tốc', comfort: 'êm chân', style: 'kiểu dáng', durability: 'bền bỉ', daily: 'đi hằng ngày' }
  const KEY = { performance: 'perf', comfort: 'comfort', style: 'style', durability: 'durability', daily: 'daily' }
  const weak = []
  for (const k of Object.keys(AXIS_VN)) {
    if ((prefs?.[k] || 0) >= 25 && (product?.[KEY[k]] ?? 100) < 60) weak.push(AXIS_VN[k])
  }
  return weak
}

// Câu funnel để agent nói được số loại ("loại 18 vì vượt ngân sách...").
function funnelLine(funnel, budget, brands) {
  const parts = [`quét ${funnel.scanned} mẫu`]
  if (funnel.brandCut) parts.push(`loại ${funnel.brandCut} khác brand${brands?.length ? ` (${brands.join('/')})` : ''}`)
  if (funnel.budgetCut) parts.push(`loại ${funnel.budgetCut} vượt ngân sách${budget ? ` (${budget})` : ''}`)
  parts.push(`giữ ${funnel.kept} phù hợp`)
  return parts.join(', ')
}

module.exports = { buildPrefs, matchScore, BUDGET, LABEL_PURPOSE, topWeakAxis, funnelLine }
