// Bản đồ hành trình đơn hàng (feature #8) — SVG thuần, không dùng map SDK.
// Tọa độ [lat, lon]; chiếu đơn giản tuyến tính sang viewBox 600x520.
const W = 600
const H = 520
const LON0 = 102.0
const LON1 = 110.0
const LAT0 = 23.4
const LAT1 = 8.4

export const project = ([lat, lon]) => [
  ((lon - LON0) / (LON1 - LON0)) * (W - 40) + 20,
  ((LAT0 - lat) / (LAT0 - LAT1)) * (H - 40) + 20,
]

export const CITIES = [
  { key: 'hanoi', name: 'Hà Nội', ll: [21.0278, 105.8342], aliases: ['hà nội', 'hanoi'] },
  { key: 'hcm', name: 'TP. Hồ Chí Minh', ll: [10.8231, 106.6297], aliases: ['hồ chí minh', 'ho chi minh', 'sài gòn', 'saigon', 'tp.hcm', 'tphcm'] },
  { key: 'danang', name: 'Đà Nẵng', ll: [16.0544, 108.2022], aliases: ['đà nẵng', 'da nang'] },
  { key: 'haiphong', name: 'Hải Phòng', ll: [20.8449, 106.6881], aliases: ['hải phòng', 'hai phong'] },
  { key: 'cantho', name: 'Cần Thơ', ll: [10.0452, 105.7469], aliases: ['cần thơ', 'can tho'] },
  { key: 'nhatrang', name: 'Nha Trang', ll: [12.2388, 109.1967], aliases: ['nha trang'] },
  { key: 'dalat', name: 'Đà Lạt', ll: [11.9404, 108.4583], aliases: ['đà lạt', 'da lat'] },
  { key: 'hue', name: 'Huế', ll: [16.4637, 107.5909], aliases: ['huế', 'hue', 'thừa thiên'] },
  { key: 'vinh', name: 'Vinh', ll: [18.6796, 105.6813], aliases: ['vinh', 'nghệ an'] },
  { key: 'quynhon', name: 'Quy Nhơn', ll: [13.7828, 109.2196], aliases: ['quy nhơn', 'quy nhon', 'bình định'] },
  { key: 'thainguyen', name: 'Thái Nguyên', ll: [21.5942, 105.8482], aliases: ['thái nguyên', 'thai nguyen'] },
  { key: 'buonmathuot', name: 'Buôn Ma Thuột', ll: [12.6676, 108.0376], aliases: ['buôn ma thuột', 'buon ma thuot', 'đắk lắk'] },
]

export const HANOI = CITIES[0]

// Tìm thành phố trong chuỗi (địa chỉ hoặc tên tỉnh) — match alias substring
export function findCity(text) {
  const t = String(text || '').toLowerCase()
  if (!t) return null
  // match alias dài nhất trước (tránh 'vinh' khớp trước 'nghệ an'...)
  for (const c of [...CITIES].sort((a, b) => Math.max(...b.aliases.map((x) => x.length)) - Math.max(...a.aliases.map((x) => x.length)))) {
    if (c.aliases.some((a) => t.includes(a))) return c
  }
  return null
}

// Tiến độ hành trình theo trạng thái + thời gian (đơn giản, deterministic):
// pending 0.1 · paid 0.35 · shipped 0.45→0.9 theo giờ trôi (48h tuyến dài) · done 1 · cancelled null
export function journeyProgress(order, now = Date.now()) {
  if (!order || order.status === 'cancelled') return null
  if (order.status === 'done') return 1
  if (order.status === 'pending') return 0.1
  if (order.status === 'paid') return 0.35
  const hours = (now - new Date(order.created_at).getTime()) / 3600_000
  return Math.min(0.9, 0.45 + Math.max(0, hours) / 48 * 0.45)
}

// Đường cong bezier bậc 2 giữa 2 điểm + 1 điểm trên đường theo t
export function route(a, b) {
  const [x0, y0] = project(a.ll)
  const [x1, y1] = project(b.ll)
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  // lệch ngang ~14% chiều dài, hướng theo trục dọc tuyến (cong sang Đông)
  const cx = mx + (len * 0.14 * (dy >= 0 ? 1 : -1))
  const cy = my - (len * 0.14 * (dx >= 0 ? 1 : -1)) * 0.35
  const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  const at = (t) => {
    const u = 1 - t
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]
  }
  return { d, at }
}

// Viên approx của dải đất S (đuốc tay, trang trí) — [lon, lat]
const OUTLINE = [
  [102.1, 22.4], [103.0, 22.3], [104.4, 22.8], [105.8, 23.3], [106.7, 22.8],
  [107.9, 21.7], [106.7, 20.8], [106.5, 19.9], [106.4, 18.7], [107.2, 17.4],
  [107.1, 16.4], [108.3, 15.9], [109.0, 15.0], [109.3, 13.9], [109.2, 12.5],
  [108.9, 11.6], [108.0, 10.9], [106.8, 10.4], [106.7, 9.8], [105.6, 9.2],
  [104.8, 8.6], [104.5, 9.8], [104.9, 10.6], [105.3, 11.2], [106.0, 11.8],
  [106.3, 12.3], [105.4, 13.5], [104.6, 14.5], [104.9, 15.5], [104.4, 16.3],
  [103.9, 17.4], [103.2, 18.5], [102.9, 19.6], [102.1, 20.7],
].map(([lon, lat]) => project([lat, lon]))

export const VN_OUTLINE = 'M ' + OUTLINE.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ') + ' Z'
