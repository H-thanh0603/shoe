// Workflows — macro chuỗi tool cho assistant (blueprint #1: Shopping Agent
// end-to-end Search → Filter → Compare → Recommend → Add to cart → Voucher
// → Handoff), mỗi bước qua cùng executeTool + policy + provenance + activity
// log như khi model tự gọi tool từng bước.
//
// Workflow KHÔNG phải "đường tắt vượt policy": nó gọi đúng executeTool nên
// mọi gate (PUBLIC_ALLOWED, provenance, rate-limit) vẫn áp. Checkout vẫn
// chỉ sinh ra khi NGƯỜI DÙNG bấm nút — workflow dừng ở handoff link.
//
// AI_WORKFLOW=off tắt workflow (chỉ model-driven tool chaining).

'use strict'

const { executeTool } = require('./tools.js')

const enabled = () => (process.env.AI_WORKFLOW || 'on').toLowerCase() !== 'off'

/**
 * draft_order — chuỗi "chuẩn bị đơn" cho 1 yêu cầu tự nhiên:
 *   1. recommend_products hoặc search_products (tìm ứng viên)
 *   2. check_stock size cần (nếu khách nêu size)
 *   3. add_to_cart (slug + size tốt nhất còn hàng)
 *   4. get_user_voucher (mã công khai cho subtotal)
 *   5. claim_and_attach_cart (đính nút nhận giỏ)
 * Trả { steps, shareUrl, vouchers } — shareUrl là handoff human-in-the-loop.
 *
 * @param {Object} p
 * @param {{purpose?, budget?, brands?, colors?, priorities?, query?, size?, qty?}} p.request
 * @param {Object} p.ctx — ctx chuẩn executeTool (sessionId, req, session, progress, role)
 * @returns {Promise<{ok:boolean, steps:Array, shareUrl?:string, vouchers?:Array, error?:string}>}
 */
async function draftOrder({ request, ctx }) {
  const steps = []
  const note = (tool, summary, status) => steps.push({ tool, summary, status })

  // 1) tìm ứng viên: prefer recommend nếu có purpose/budget, lùi về search
  let candidates = []
  const { purpose, budget, brands = [], colors = [], priorities = [], query, size, qty = 1 } = request || {}
  if (purpose || budget || brands.length || colors.length || priorities.length) {
    const res = await executeTool('recommend_products', { purpose, budget, brands, colors, priorities, limit: 3 }, ctx)
    note('recommend_products', res.summary, res.ok ? 'ok' : 'error')
    if (res.ok) {
      candidates = (res.result?.recommendations || []).map((r) => ({
        slug: r.slug, name: r.name, priceVnd: r.priceVnd, match: r.match, reasons: r.reasons, stockTotal: r.stockTotal,
      }))
    }
  }
  if (!candidates.length && (query || purpose)) {
    const res = await executeTool('search_products', { query: String(query || purpose || 'giày').slice(0, 50), limit: 8 }, ctx)
    note('search_products', res.summary, res.ok ? 'ok' : 'error')
    if (res.ok) {
      candidates = (res.result?.items || []).map((i) => ({
        slug: i.slug, name: i.name, priceVnd: i.priceVnd, match: null, reasons: [], stockTotal: i.stockTotal,
      }))
    }
  }
  if (!candidates.length) {
    return { ok: false, steps, error: 'Không tìm thấy sản phẩm phù hợp — agent sẽ hỏi khách thêm chi tiết.' }
  }

  // 2) chọn ứng viên top + kiểm size (khách nêu size thì cần size đó còn hàng)
  let picked = null
  let pickedSize = null
  for (const cand of candidates) {
    const res = await executeTool('check_stock', { slug: cand.slug }, ctx)
    note('check_stock', `${cand.slug}: ${res.summary}`, res.ok ? 'ok' : 'error')
    if (!res.ok) continue
    const sizes = res.result?.sizes || []
    const available = size
      ? sizes.filter((s) => s.size === Number(size) && s.stock >= qty)
      : sizes.filter((s) => s.stock >= qty).sort((a, b) => b.stock - a.stock)
    if (available.length) {
      picked = cand
      pickedSize = available[0].size
      break
    }
  }
  if (!picked) {
    return {
      ok: false, steps,
      error: size
        ? `Không size ${size} còn đủ hàng trong các ứng viên — agent báo khách chọn size khác hoặc sản phẩm khác.`
        : 'Các ứng viên đều hết hàng — agent sẽ đề xuất khác.',
    }
  }

  // 3) thêm giỏ (provenance đã có slug từ recommend/search + check_stock)
  const cartRes = await executeTool('add_to_cart', { slug: picked.slug, size: pickedSize, qty }, ctx)
  note('add_to_cart', cartRes.summary, cartRes.ok ? 'ok' : 'error')
  if (!cartRes.ok) return { ok: false, steps, error: cartRes.result?.error?.message || 'Không thêm được giỏ' }

  // 4) voucher preview cho subtotal của giỏ
  const subtotal = picked.priceVnd * qty
  let vouchers = []
  const vRes = await executeTool('get_user_voucher', { subtotal }, ctx)
  note('get_user_voucher', vRes.summary, vRes.ok ? 'ok' : 'error')
  if (vRes.ok) vouchers = vRes.result?.vouchers || []

  // 5) đính handoff link
  const attachRes = await executeTool('claim_and_attach_cart', { shareUrl: cartRes.result.shareUrl }, ctx)
  note('claim_and_attach_cart', attachRes.summary, attachRes.ok ? 'ok' : 'error')

  return {
    ok: attachRes.ok,
    steps,
    shareUrl: cartRes.result.shareUrl,
    vouchers,
    picked: { slug: picked.slug, name: picked.name, size: pickedSize, qty, priceVnd: picked.priceVnd, subtotalVnd: subtotal },
    note: 'Khách mở shareUrl → nhận giỏ → tự bấm thanh toán (human-in-the-loop).',
  }
}

module.exports = { draftOrder, enabled }
