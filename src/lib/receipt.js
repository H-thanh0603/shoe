// Vẽ hoá đơn giỏ hàng ra canvas (PNG) — không cần html2canvas, tự vẽ 2D API.
// Văn bản text "receipt": nền giấy, đường kẻ đứt, barcode giả, font sans đậm.
const PAPER = '#f5f2ec'
const INK = '#141414'
const MUTED = '#6b6b6b'
const ACCENT = '#d43a2a'
const W = 640

const fmt = (n) => n.toLocaleString('vi-VN') + '₫'

export async function renderReceipt(cart) {
  const scale = 2 // retina
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const pad = 44
  const rowH = 46
  const headerH = 150
  const footerH = 190
  const height = headerH + cart.items.length * rowH + footerH + 90
  canvas.width = W * scale
  canvas.height = height * scale
  ctx.scale(scale, scale)

  // nền giấy + khung kép
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, height)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(12, 12, W - 24, height - 24)
  ctx.lineWidth = 1
  ctx.strokeRect(18, 18, W - 36, height - 36)

  // header
  ctx.fillStyle = INK
  ctx.textBaseline = 'top'
  ctx.font = '900 46px system-ui, sans-serif'
  ctx.fillText('KINETIC', pad, 48)
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillStyle = ACCENT
  ctx.fillText('GIỎ HÀNG CHỜ THANH TOÁN', pad, 104)
  const d = new Date()
  ctx.fillStyle = MUTED
  ctx.textAlign = 'right'
  ctx.fillText(d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), W - pad, 104)
  ctx.textAlign = 'left'

  // đường đứt header
  const dash = (y) => {
    ctx.setLineDash([6, 5])
    ctx.strokeStyle = INK
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad, y)
    ctx.lineTo(W - pad, y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  dash(headerH - 10)

  // items
  let y = headerH + 14
  ctx.font = '600 16px system-ui, sans-serif'
  for (const it of cart.items) {
    ctx.fillStyle = INK
    const size = it.size ? ` · size ${it.size}` : ''
    ctx.fillText(`${it.qty}× ${it.name}${size}`.slice(0, 44), pad, y)
    ctx.textAlign = 'right'
    ctx.fillText(fmt(it.lineTotalVnd ?? it.priceVnd * it.qty), W - pad, y)
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTED
    ctx.font = '500 12px system-ui, sans-serif'
    y += 22
    ctx.fillText(`/${it.slug || ''}`, pad, y)
    ctx.font = '600 16px system-ui, sans-serif'
    y += rowH - 22
  }

  // total
  dash(y + 2)
  y += 24
  ctx.fillStyle = MUTED
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillText('TỔNG CỘNG', pad, y)
  ctx.textAlign = 'right'
  ctx.fillStyle = ACCENT
  ctx.font = '900 30px system-ui, sans-serif'
  ctx.fillText(fmt(cart.totalVnd), W - pad, y - 8)
  ctx.textAlign = 'left'

  // footer + barcode giả (dải đen dày mỏng ngẫu nhiên seed từ total)
  const fy = height - footerH + 8
  ctx.fillStyle = MUTED
  ctx.font = '500 12px system-ui, sans-serif'
  ctx.fillText('Cam kết 100% AUTH — hoàn 200% nếu fake. Đổi size miễn phí 30 ngày.', pad, fy)
  ctx.fillText('kinetic.vn — Kho Hà Nội, giao toàn quốc 2h express nội thành.', pad, fy + 18)

  let seed = cart.totalVnd || 1
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let bx = pad
  while (bx < W - pad - 10) {
    const bw = 1 + Math.floor(rnd() * 4)
    ctx.fillStyle = INK
    ctx.fillRect(bx, fy + 44, bw, 34)
    bx += bw + 1 + Math.floor(rnd() * 3)
  }
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.fillStyle = INK
  ctx.fillText(`KIN-SHARE-${String(cart.totalVnd % 100000).padStart(5, '0')}`, pad, fy + 88)

  return canvas
}
