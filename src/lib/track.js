// Event tracking client (Bước 7.7) — queue + batch flush.
// fire-and-forget: mọi lỗi nuốt im lặng, không bao giờ vỡ app.
import { apiSendBeacon } from './api.js'

let queue = []
let timer = null

const flush = () => {
  timer && clearTimeout(timer)
  timer = null
  if (!queue.length) return
  const events = queue
  queue = []
  apiSendBeacon('/events', { events }) // nuốt — tracking không critical
}

export const track = (type, productId, meta) => {
  queue.push({ type, ...(productId && { productId }), ...(meta && { meta }) })
  // flush khi đủ 5 hoặc sau 4s
  if (queue.length >= 5) flush()
  else timer ??= setTimeout(flush, 4000)
}

// tab ẩn/closed → flush ngay (keepalive sống sót page unload)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
})
