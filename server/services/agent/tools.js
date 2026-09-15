// Agent Tools — bridge giữa AWI tool registry (đơn nguồn của shop) và
// agent runtime provider-agnostic.
//
// KHÔNG định nghĩa tool mới ở đây — mọi commerce tool đã có trong
// server/routes/agentTools.js (search_products, get_product, check_stock,
// get_reviews, compare_products, recommend_products, track_order,
// add_to_cart). File này:
//  1. Expose TOOLS theo format chuẩn AI (ToolSpec: name/description/inputSchema)
//  2. Bọc handler: validate args (zod mirror đã có), fence output (JSON + cắt
//     dài — concept fencing của commerce-agents), progress callback
//  3. Áp policy: tool nào được assistant public dùng, tool nào merchant-only
//
// Thêm tool commerce mới = thêm vào TOOLS của agentTools.js (registry đơn
// nguồn) → assistant/merchant + discovery/manifest tự thấy (docs AGENT_LAYER).

'use strict'

const { TOOLS: AWI_TOOLS, buildZod: _buildZod } = require('../../routes/agentTools.js')
const activity = require('./activity.js')

// ————————————————————————————————————————————————
// Policy: assistant public (khách) được tool nào
// ————————————————————————————————————————————————
// Mặc định: mọi tool readOnly + add_to_cart (human-in-the-loop qua shareUrl)
// + memory (blueprint #10) + voucher preview + claim handoff (blueprint #1).
// Merchant agent (admin, có perm agent:*) — có thể mở tool stage change.
const PUBLIC_ALLOWED = new Set([
  'search_products', 'get_product', 'check_stock', 'get_reviews',
  'compare_products', 'recommend_products', 'track_order', 'add_to_cart',
  'get_user_voucher', 'claim_and_attach_cart', 'get_memory', 'save_memory',
])

const MAX_TOOL_RESULT_CHARS = Number(process.env.AI_TOOL_RESULT_MAX_CHARS) || 12_000

/**
 * ToolSpec chuẩn AIProvider cho 1 AWI tool.
 * @param {Object} t — entry trong TOOLS của agentTools.js
 */
function toSpec(t) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    readOnly: t.readOnly !== false,
  }
}

/**
 * Execute 1 tool call từ model (đã qua zod validation của registry).
 * @param {string} name
 * @param {Object} args — args từ model (JSON)
 * @param {Object} ctx — {agentId, progress(msg)}
 * @returns {{ ok: boolean, result: any, summary: string }} — result để nhét vào
 *   tool_result content (đã fenced); summary ngắn cho SSE event
 */
/**
 * Ghi AI Activity Log (blueprint #5) — await để đảm bảo thứ tự ghi (mọi
 * tool call TRƯỚC khi trả kết quả có dòng log tương ứng; admin + test tra
 * cứu theo session không bị race). Track failure vẫn best-effort:
 * logToolCall tự catch lỗi bên trong → DB lỗi không làm gãy tool call.
 */
async function logActivity(ctx, name, status, args, summary, errorCode) {
  await activity.logToolCall({
    sessionId: ctx?.sessionId || '',
    userId: ctx?.req?.user?.id ?? null,
    agentName: ctx?.role === 'merchant' ? 'merchant' : 'shopping',
    agentId: ctx?.agentId || '',
    tool: name,
    status,
    args,
    summary,
    errorCode,
    sessionTurn: ctx?.sessionTurn ?? null,
    requestId: ctx?.req?.id || '',
    ip: ctx?.req?.ip || '',
  }).catch(() => { /* log là best-effort */ })
}

async function executeTool(name, args, ctx) {
  const tool = AWI_TOOLS.find((t) => t.name === name)
  if (!tool) {
    await logActivity(ctx, name, 'error', args, 'tool không tồn tại', 'TOOL_NOT_FOUND')
    return { ok: false, result: { error: { code: 'TOOL_NOT_FOUND', message: `Không có tool "${name}"` } }, summary: `tool "${name}" không tồn tại` }
  }
  if (ctx?.role !== 'merchant' && !PUBLIC_ALLOWED.has(name)) {
    await logActivity(ctx, name, 'blocked', args, 'policy chặn tool cho assistant public', 'TOOL_NOT_ALLOWED')
    return { ok: false, result: { error: { code: 'TOOL_NOT_ALLOWED', message: `Tool "${name}" không dành cho assistant public` } }, summary: `tool "${name}" bị policy chặn` }
  }
  // validate args theo schema của registry (chống tool-poisoning shape)
  const zodMirror = _buildZod(tool.inputSchema)
  const parsed = zodMirror.safeParse(args || {})
  if (!parsed.success) {
    const summary = `args sai shape (${parsed.error.issues.length} lỗi)`
    await logActivity(ctx, name, 'error', args, summary, 'INVALID_TOOL_ARGS')
    return {
      ok: false,
      result: { error: { code: 'INVALID_TOOL_ARGS', fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
      summary: `args sai shape (${parsed.error.issues.length} lỗi)`,
    }
  }
  // ——— Provenance gate (port check_provenance của blueprint gates.py) ———
  // add_to_cart chỉ nhận slug mà catalog tool ĐÃ TRẢ VỀ trong session này
  // (model "nhìn trước mua sau") — chặn tool-result-injection: dữ liệu ngoài
  // (mô tả sản phẩm, review…) không thể nhét product lạ vào giỏ.
  if (name === 'add_to_cart' && ctx?.session) {
    const slug = String(parsed.data.slug || '').trim()
    if (!ctx.session.seenSlugs.has(slug)) {
      const summary = 'bị provenance gate chặn (slug chưa thấy)'
      await logActivity(ctx, name, 'blocked', parsed.data, summary, 'PROVENANCE_ERROR')
      return {
        ok: false,
        result: {
          error: {
            code: 'PROVENANCE_ERROR',
            message: `slug "${slug}" chưa được catalog tool (search/get/recommend/compare) trả về trong phiên này — gọi tool tìm kiếm trước, dùng đúng slug từ kết quả.`,
          },
        },
        summary,
      }
    }
  }
  // claim_and_attach_cart: provenance tương tự — shareUrl phải do add_to_cart
  // của session này sinh ra (session.seenShareUrls ghi khi add_to_cart ok).
  if (name === 'claim_and_attach_cart' && ctx?.session) {
    const token = /\/gio-hang\/([a-z0-9-]+)/i.exec(String(parsed.data.shareUrl || ''))?.[1]
    if (!token || !ctx.session.seenShareUrls?.has(token)) {
      const summary = 'bị provenance gate chặn (shareUrl chưa do add_to_cart tạo)'
      await logActivity(ctx, name, 'blocked', parsed.data, summary, 'PROVENANCE_ERROR')
      return {
        ok: false,
        result: {
          error: {
            code: 'PROVENANCE_ERROR',
            message: 'shareUrl này không do add_to_cart tạo trong phiên — hãy dùng shareUrl từ kết quả add_to_cart vừa rồi.',
          },
        },
        summary,
      }
    }
  }
  try {
    const result = await tool.handler(parsed.data, {
      agentId: ctx?.agentId || 'runtime',
      req: ctx?.req,
      progress: ctx?.progress || (() => {}),
    })
    // catalog tools → ghi nhận slugs đã thấy (nếu session có track)
    if (ctx?.session && CATALOG_TOOLS.has(name)) {
      for (const s of collectSlugs(result)) ctx.session.seenSlugs.add(s)
    }
    // add_to_cart ok → ghi shareUrl token cho claim_and_attach_cart
    if (name === 'add_to_cart' && ctx?.session) {
      const tok = /\/gio-hang\/([a-z0-9-]+)/i.exec(String(result?.shareUrl || ''))?.[1]
      if (tok) {
        if (!ctx.session.seenShareUrls) ctx.session.seenShareUrls = new Set()
        ctx.session.seenShareUrls.add(tok)
      }
    }
    await logActivity(ctx, name, 'ok', parsed.data, summarize(name, result))
    return { ok: true, result, summary: summarize(name, result) }
  } catch (e) {
    // handler throw httpError chuẩn — translate thành result có cấu trúc
    const code = e?.code || 'TOOL_ERROR'
    await logActivity(ctx, name, 'error', parsed.data, `tool lỗi: ${code}`, code)
    return {
      ok: false,
      result: { error: { code, message: e?.status && e.status < 500 ? e.message : 'Lỗi khi chạy tool' } },
      summary: `tool lỗi: ${code}`,
    }
  }
}

/** Tool "catalog" = tool đọc sản phẩm, trả slug model được phép cite. */
const CATALOG_TOOLS = new Set(['search_products', 'get_product', 'recommend_products', 'compare_products'])

// slug pattern theo seed DB (kebab-case: air-vector-01, pulse-dash-02…)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/

/** Săn slug đệ quy trong kết quả tool (items[].slug, product.slug, …). */
function collectSlugs(value, out = new Set(), depth = 0) {
  if (depth > 6 || value == null) return out
  if (Array.isArray(value)) {
    for (const v of value) collectSlugs(v, out, depth + 1)
    return out
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'slug' && typeof v === 'string' && SLUG_RE.test(v)) out.add(v)
      else collectSlugs(v, out, depth + 1)
    }
  }
  return out
}

function summarize(name, result) {
  try {
    if (name === 'search_products' && result?.total !== undefined) return `${result.total} kết quả`
    if (name === 'compare_products' && Array.isArray(result)) return `so sánh ${result.length} sản phẩm`
    if (name === 'recommend_products' && result?.recommendations) return `${result.recommendations.length} gợi ý`
    if (name === 'add_to_cart') return `đã thêm vào giỏ agent — ${result?.shareUrl || ''}`
    if (name === 'track_order') return `trạng thái: ${result?.status || '?'}`
    if (name === 'get_user_voucher') return `${result?.vouchers?.length ?? 0} mã giảm giá công khai`
    if (name === 'claim_and_attach_cart') return result?.attached ? 'đã đính link nhận giỏ' : 'chưa đính được'
    if (name === 'get_memory') return `${result?.remembered?.length ?? 0} ghi nhớ về khách`
    if (name === 'save_memory') return `đã lưu ${result?.savedCount ?? 0} ghi nhớ`
    return 'ok'
  } catch { return 'ok' }
}

/**
 * Serialize result cho tool_result content — port pipeline fencing của
 * commerce-agents (commerce_common/fence.py): dữ liệu ngoài (mô tả sản phẩm,
 * review của khách…) không được phép giả mạo instruction/model transcript.
 *
 * Pipeline: strip control chars + bỏ fence markers giả + bỏ markers giả mạo
 * transcript/tool-call → cắt chiều dài → bọc trong fence cố định.
 * Model thấy "dữ liệu", không phải "instruction".
 */

// ký tự điều khiển C0/C1 + zero-width — bỏ hết trước khi fence
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F\u0080-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g
// fence marker giả: chỉ THAY CHÍNH marker 3+ backtick bằng 1 backtick —
// KHÔNG ăn phần sau nó (vì JSON tool-result thường 1 dòng dài; regex có
// [^\n]*$ sẽ nuốt hết dòng và mất dữ liệu thật)
const FORGED_FENCE_RE = /`{3,}/g
// markers model dùng trong transcript — không cho phép sống trong data
const TRANSCRIPT_MARKERS = [
  /<\/?(antml|tool)[a-z_]*[^>]*>/gi, // SDK tool-call tags (antml:…)
  /\[(?:tool_use|tool_result|system|assistant|user)\]/gi, // block giả
  /^\s*(?:system|assistant|user|tool)\s*:/gim, // role giả ở đầu dòng
]

function sanitizeUntrusted(text) {
  let out = text.replace(CONTROL_CHARS_RE, '')
  out = out.replace(FORGED_FENCE_RE, '`')
  for (const re of TRANSCRIPT_MARKERS) out = out.replace(re, (m) => m.replace(/[^\s]/g, '·'))
  return out
}

function fenceResult(result) {
  let text
  try {
    text = JSON.stringify(result)
  } catch {
    text = String(result)
  }
  text = sanitizeUntrusted(text)
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    // cắt + sanitize LẠI phần đã cắt (slice có thể cắt giữa escape/marker,
    // để lại `` ` `` hở mở fence mới)
    const clipped = sanitizeUntrusted(text.slice(0, MAX_TOOL_RESULT_CHARS))
    return '```\n' + clipped + '\n…(đã cắt)\n```'
  }
  return '```json\n' + text + '\n```'
}

/** Danh sách ToolSpec cho assistant public (frontend agent + gateway). */
function publicToolSpecs() {
  return AWI_TOOLS.filter((t) => PUBLIC_ALLOWED.has(t.name)).map(toSpec)
}

/** Đầy đủ (merchant) — mọi tool AWI. */
function allToolSpecs() {
  return AWI_TOOLS.map(toSpec)
}

module.exports = {
  publicToolSpecs,
  allToolSpecs,
  executeTool,
  fenceResult,
  PUBLIC_ALLOWED,
  CATALOG_TOOLS,
  collectSlugs,
}
