// Match engine (Bước 7.3) — client-side, pure. Không recommend endpoint —
// ponytail: dataset 26 sp, thêm endpoint /recommend khi sp > 200.
const DNA_KEYS = [
  ['performance', 'perf'],
  ['comfort', 'comfort'],
  ['style', 'style'],
  ['durability', 'durability'],
  ['daily', 'daily'],
]
const LABELS = { performance: 'PERFORMANCE', comfort: 'COMFORT', style: 'FASHION', durability: 'DURABILITY', daily: 'DAILY' }
const LABEL_PURPOSE = { running: 'chạy', street: 'streetwear', court: 'bóng rổ', daily: 'đi hằng ngày', trail: 'outdoor' }
const BUDGET = { 'under-2m': 2000000, '2-4m': 4000000, '4m+': Infinity }

export function matchScore(profile, product) {
  const prefs = profile?.prefs
  if (!prefs || product?.perf == null) return null

  // dna score: weighted avg các trục user có weight > 0
  let sum = 0, wsum = 0, top = null
  for (const [k, pk] of DNA_KEYS) {
    const w = prefs[k] || 0
    if (w > 0) { sum += w * (product[pk] ?? 0); wsum += w; if (!top || w > prefs[top]) top = k }
  }
  let pct = wsum ? Math.round(sum / wsum) : 50
  const reasons = []

  if (profile.purpose && product.purpose === profile.purpose) { pct = Math.min(100, pct + 8); reasons.push(`Bạn chọn mục đích ${LABEL_PURPOSE[profile.purpose]}`) }
  if (profile.brands?.includes(product.brand)) { pct = Math.min(100, pct + 4); reasons.push('Thương hiệu bạn thích') }
  if (profile.colors?.some((c) => product.colors?.includes(c))) { pct = Math.min(100, pct + 4); reasons.push('Có màu bạn chọn') }

  const cap = BUDGET[profile.budget]
  if (cap != null && product.price_vnd <= cap) reasons.push('Phù hợp ngân sách')
  if (top) reasons.unshift(top === 'style' ? 'Bạn ưu tiên diện mạo' : `Bạn ưu tiên ${LABELS[top].toLowerCase()}`)

  // budget + top-trait giữ lại, phần thừa cắt từ giữa
  return { pct, reasons: reasons.length <= 4 ? reasons : [reasons[0], ...reasons.slice(1, -1).slice(0, 2), reasons.at(-1)] }
}

export function sortProducts(profile, products) {
  if (!profile?.prefs) return products
  const scores = new Map(products.map((p) => [p.id, matchScore(profile, p)?.pct ?? -1]))
  // ponytail: sort copy mỗi call — memo ở caller nếu grid re-render nhiều
  return [...products].sort((a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1))
}
