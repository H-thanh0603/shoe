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

// ————————————————————————————————————————————————
// Policy: assistant public (khách) được tool nào
// ————————————————————————————————————————————————
// Mặc định: mọi tool readOnly + add_to_cart (human-in-the-loop qua shareUrl).
// Merchant agent (admin, có perm agent:*) — sau này có thể mở tool stage change.
const PUBLIC_ALLOWED = new Set([
  'search_products', 'get_product', 'check_stock', 'get_reviews',
  'compare_products', 'recommend_products', 'track_order', 'add_to_cart',
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
async function executeTool(name, args, ctx) {
  const tool = AWI_TOOLS.find((t) => t.name === name)
  if (!tool) {
    return { ok: false, result: { error: { code: 'TOOL_NOT_FOUND', message: `Không có tool "${name}"` } }, summary: `tool "${name}" không tồn tại` }
  }
  if (ctx?.role === 'assistant' && !PUBLIC_ALLOWED.has(name)) {
    return { ok: false, result: { error: { code: 'TOOL_NOT_ALLOWED', message: `Tool "${name}" không dành cho assistant public` } }, summary: `tool "${name}" bị policy chặn` }
  }
  // validate args theo schema của registry (chống tool-poisoning shape)
  const zodMirror = _buildZod(tool.inputSchema)
  const parsed = zodMirror.safeParse(args || {})
  if (!parsed.success) {
    return {
      ok: false,
      result: { error: { code: 'INVALID_TOOL_ARGS', fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
      summary: `args sai shape (${parsed.error.issues.length} lỗi)`,
    }
  }
  try {
    const result = await tool.handler(parsed.data, {
      agentId: ctx?.agentId || 'runtime',
      req: ctx?.req,
      progress: ctx?.progress || (() => {}),
    })
    return { ok: true, result, summary: summarize(name, result) }
  } catch (e) {
    // handler throw httpError chuẩn — translate thành result có cấu trúc
    return {
      ok: false,
      result: { error: { code: e?.code || 'TOOL_ERROR', message: e?.status && e.status < 500 ? e.message : 'Lỗi khi chạy tool' } },
      summary: `tool lỗi: ${e?.code || e?.message || 'unknown'}`,
    }
  }
}

function summarize(name, result) {
  try {
    if (name === 'search_products' && result?.total !== undefined) return `${result.total} kết quả`
    if (name === 'compare_products' && Array.isArray(result)) return `so sánh ${result.length} sản phẩm`
    if (name === 'recommend_products' && result?.recommendations) return `${result.recommendations.length} gợi ý`
    if (name === 'add_to_cart') return `đã thêm vào giỏ agent — ${result?.shareUrl || ''}`
    if (name === 'track_order') return `trạng thái: ${result?.status || '?'}`
    return 'ok'
  } catch { return 'ok' }
}

/**
 * Serialize result cho tool_result content (fencing: cắt dài, JSON compact).
 * Concept "fenced tool results" của commerce-agents: model chỉ thấy dữ liệu
 * đã được giới hạn — không inject nội dung dài lê thê vào context.
 */
function fenceResult(result) {
  let text
  try {
    text = JSON.stringify(result)
  } catch {
    text = String(result)
  }
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    // cắt giữa JSON string vẫn parse được? — không; cắt + bọc markdown fence
    return '```\n' + text.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…(đã cắt)\n```'
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
}
