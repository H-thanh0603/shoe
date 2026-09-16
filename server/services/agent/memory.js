// Agent Memory — preference khách hàng (blueprint #10: Agent Memory).
//
// Khác chatbot: assistant NHỚ "khách thích Nike, size 42, ngân sách 2 triệu"
// qua các phiên. Memory phân 2 loại:
//  - explicit: khách nói trực tiếp ("tôi thường mua size 42")
//  - inferred:  agent suy từ hành vi (khách hỏi 3 lần giày running)
// Explicit luôn thắng inferred; không bao giờ lưu sensitive (số thẻ, địa
// chỉ, email, mật khẩu) — whitelist key chặn sẵn.
//
// Storage: bảng agent_memory (migrate 018). Key phân vùng theo user login
// ('user:<id>') hoặc theo IP hash cho guest ('anon:<hash>') — IP bị hash để
// log không lưu plaintext IP (tương tự pii.js).

'use strict'

const crypto = require('node:crypto')
const pool = require('../../db.js')

// Chặn stored prompt injection: value render thẳng vào system prompt nên phải
// loại tag/cú pháp điều khiển (kẻ lưu style="bỏ qua quy tắc..." sẽ ám mọi turn).
// Chạy ở normalize (lúc save) + render (phòng dòng cũ đã lưu).
const sanitizeValue = (v) => String(v ?? '')
  .replace(/[<>{}[\]`$\\]/g, '')
  .replace(/\b(system|assistant|user|role|instruction|ignore|bỏ qua)\s*:/gi, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 60)

// ——— whitelist key + validation ———
const MEMORY_KEYS = {
  preferred_brand: { validate: (v) => /^[A-Za-z0-9 .'-]{1,30}$/.test(v), normalize: (v) => sanitizeValue(v).toUpperCase() },
  shoe_size: { validate: (v) => Number.isInteger(Number(v)) && Number(v) >= 35 && Number(v) <= 46, normalize: (v) => String(Number(v)) },
  budget: { validate: (v) => ['under-2m', '2-4m', '4m+'].includes(v), normalize: (v) => v },
  preferred_purpose: { validate: (v) => ['running', 'street', 'court', 'daily', 'trail'].includes(v), normalize: (v) => v },
  preferred_style: { validate: (v) => typeof v === 'string' && v.length >= 2 && v.length <= 60, normalize: (v) => sanitizeValue(v).toLowerCase() },
}

const KEY_LABELS = {
  preferred_brand: 'brand ưa thích',
  shoe_size: 'size giày',
  budget: 'ngân sách',
  preferred_purpose: 'mục đích chính',
  preferred_style: 'phong cách ưa thích',
}

/**
 * Phân vùng memory theo identity của request.
 * @param {Object} req — express req (đã qua attachUser)
 * @returns {{ key: string, userId: number|null }}
 */
function resolveKey(req) {
  if (req?.user?.id) return { key: `user:${req.user.id}`, userId: req.user.id }
  const raw = String(req?.ip || 'unknown')
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
  return { key: `anon:${hash}`, userId: null }
}

/**
 * Đọc toàn bộ preference của 1 phân vùng, trả dạng friendly cho prompt/tool.
 * @returns {Promise<Array<{key,label,value,source,confidence}>>}
 */
async function getPreferences(memoryKey) {
  const { rows } = await pool.query(
    `SELECT key, value, source, confidence FROM agent_memory
     WHERE session_key = $1 AND kind = 'preference'
     ORDER BY key ASC`, [memoryKey])
  return rows.map((r) => ({
    key: r.key,
    label: KEY_LABELS[r.key] || r.key,
    value: r.value,
    source: r.source,
    confidence: r.confidence,
  }))
}

/**
 * Render preferences thành block text cho system prompt (turn đầu).
 * @returns {Promise<string>} '' nếu không có memory
 */
async function preferencesForPrompt(memoryKey) {
  const prefs = await getPreferences(memoryKey)
  if (!prefs.length) return ''
  const lines = prefs.map((p) => `- ${p.label}: ${sanitizeValue(p.value)}${p.source === 'inferred' ? ' (suy đoán — xác nhận lại với khách nếu ảnh hưởng đề xuất)' : ''}`)
  return [
    '## Ghi nhớ về khách (từ các phiên trước)',
    ...lines,
    '- Dùng các ghi nhớ này để cá nhân hóa đề xuất (brand/size/ngân sách/mục đích). Nếu khách nói khác ghi nhớ → theo khách MỚI NHẤT và cập nhật bằng save_memory.',
  ].join('\n')
}

/**
 * Upsert 1 preference. Explicit đè inferred; inferred KHÔNG đè explicit.
 * @param {string} memoryKey
 * @param {{key:string, value:string, source?:'explicit'|'inferred', confidence?:number}} entry
 * @returns {Promise<{saved:boolean, key:string, value:string, reason?:string}>}
 */
async function upsertPreference(memoryKey, entry) {
  const spec = MEMORY_KEYS[entry?.key]
  if (!spec) return { saved: false, key: entry?.key || '', value: '', reason: `key không hợp lệ (cho phép: ${Object.keys(MEMORY_KEYS).join(', ')})` }
  const raw = entry?.value == null ? '' : String(entry.value)
  if (!spec.validate(raw)) return { saved: false, key: entry.key, value: raw, reason: 'giá trị không hợp lệ' }
  const value = spec.normalize(raw)
  const source = entry.source === 'inferred' ? 'inferred' : 'explicit'
  const confidence = Math.min(100, Math.max(1, Number(entry.confidence) || (source === 'explicit' ? 100 : 60)))
  const userId = memoryKey.startsWith('user:') ? Number(memoryKey.slice(5)) : null

  const { rows: [row] } = await pool.query(
    `INSERT INTO agent_memory (user_id, session_key, kind, key, value, source, confidence, last_seen)
     VALUES ($1, $2, 'preference', $3, $4, $5, $6, now())
     ON CONFLICT (session_key, kind, key) DO UPDATE SET
       value = CASE
         WHEN agent_memory.source = 'explicit' AND EXCLUDED.source = 'inferred' THEN agent_memory.value
         ELSE EXCLUDED.value END,
       source = CASE
         WHEN agent_memory.source = 'explicit' AND EXCLUDED.source = 'inferred' THEN agent_memory.source
         ELSE EXCLUDED.source END,
       confidence = CASE
         WHEN agent_memory.source = 'explicit' AND EXCLUDED.source = 'inferred' THEN agent_memory.confidence
         ELSE GREATEST(agent_memory.confidence, EXCLUDED.confidence) END,
       user_id = COALESCE(EXCLUDED.user_id, agent_memory.user_id),
       last_seen = now()
     RETURNING key, value, source`,
    [userId, memoryKey, entry.key, value, source, confidence],
  )
  return { saved: true, key: row.key, value: row.value, source: row.source }
}

/**
 * Lưu nhiều preference 1 lần (tool save_memory gọi).
 * @param {string} memoryKey
 * @param {Array} entries
 */
async function savePreferences(memoryKey, entries) {
  const results = []
  for (const e of Array.isArray(entries) ? entries.slice(0, 8) : []) {
    results.push(await upsertPreference(memoryKey, e).catch((err) => ({
      saved: false, key: e?.key || '', value: String(e?.value ?? ''), reason: err?.message || 'lỗi DB',
    })))
  }
  return results
}

// Xoá toàn bộ preference của 1 phân vùng (quyền quên — khách yêu cầu "quên tôi đi").
async function clearPreferences(memoryKey) {
  const { rowCount } = await pool.query(
    `DELETE FROM agent_memory WHERE session_key = $1 AND kind = 'preference'`, [memoryKey])
  return rowCount
}

module.exports = {
  resolveKey, getPreferences, preferencesForPrompt,
  upsertPreference, savePreferences, clearPreferences, sanitizeValue, MEMORY_KEYS, KEY_LABELS,
}
