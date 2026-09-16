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

// ——— draftBundle: "bundle một chạm" ———
// Khách nêu NHU CẦU ("đi chạy mùa mưa", "đi học cả tuần") → agent dựng sẵn cả
// combo 2–3 món bổ trợ (giày chính + món phụ cùng purpose/budget) trong CÙNG
// 1 giỏ agent → 1 shareUrl. Khác chatbot thường ở chỗ: không dừng ở gợi ý chữ,
// khách bấm 1 link là có cả combo trong giỏ, chỉ việc thanh toán.
//
// Chọn món: recommend top-1 làm món chính, search thêm 1–2 món phụ khác slug
// (ưu tiên rẻ hơn 50% giá chính — phụ kiện/tất/lót). Mỗi món add_to_cart riêng
// (mỗi call sinh token riêng) nhưng cùng giỏ agent → dùng shareUrl CUỐI (token
// nào của cùng cart cũng claim được cả giỏ).
async function draftBundle({ request, ctx }) {
  const steps = []
  const note = (tool, summary, status) => steps.push({ tool, summary, status })
  const { purpose, budget, brands = [], size, qty = 1 } = request || {}

  // 1) món chính = draftOrder có sẵn (recommend → stock → add)
  const main = await draftOrder({ request, ctx })
  for (const s of main.steps) steps.push(s)
  if (!main.ok) return { ok: false, steps, error: main.error || 'Không dựng được món chính' }

  // 2) món phụ: recommend cùng profile nhưng lấy hạng 2–4 (khác món chính),
  // rẻ hơn hoặc bằng giá chính — tối đa 2 món bổ trợ cùng nhu cầu.
  const picked = main.picked
  const extras = []
  const rec2 = await executeTool('recommend_products', { purpose, budget, brands, limit: 4 }, ctx)
  note('recommend_products', `phụ: ${rec2.summary}`, rec2.ok ? 'ok' : 'error')
  if (rec2.ok) {
    const cands = (rec2.result?.recommendations || [])
      .filter((r) => r.slug !== picked.slug && r.priceVnd <= picked.priceVnd)
      .slice(0, 2)
    for (const cand of cands) {
      const st = await executeTool('check_stock', { slug: cand.slug }, ctx)
      note('check_stock', `${cand.slug}: ${st.summary}`, st.ok ? 'ok' : 'error')
      if (!st.ok) continue
      const sizes = st.result?.sizes || []
      const avail = size
        ? sizes.filter((s) => s.size === Number(size) && s.stock >= 1)
        : sizes.filter((s) => s.stock >= 1).sort((a, b) => b.stock - a.stock)
      if (!avail.length) continue
      const add = await executeTool('add_to_cart', { slug: cand.slug, size: avail[0].size, qty: 1 }, ctx)
      note('add_to_cart', `${cand.slug}: ${add.summary}`, add.ok ? 'ok' : 'error')
      if (add.ok) extras.push({ slug: cand.slug, name: cand.name, size: avail[0].size, priceVnd: cand.priceVnd })
      if (extras.length >= 2) break
    }
  }

  // 3) voucher cho tổng combo + handoff link cuối (cùng giỏ agent)
  const subtotal = picked.subtotalVnd + extras.reduce((s, e) => s + e.priceVnd, 0)
  let vouchers = main.vouchers || []
  const vRes = await executeTool('get_user_voucher', { subtotal }, ctx)
  note('get_user_voucher', vRes.summary, vRes.ok ? 'ok' : 'error')
  if (vRes.ok) vouchers = vRes.result?.vouchers || []

  return {
    ok: true, steps,
    shareUrl: main.shareUrl,
    vouchers,
    bundle: { main: picked, extras, subtotalVnd: subtotal, count: 1 + extras.length },
    note: `Combo ${1 + extras.length} món đã trong giỏ — khách mở shareUrl → thanh toán 1 lần.`,
  }
}

module.exports = { draftOrder, draftBundle, enabled }
