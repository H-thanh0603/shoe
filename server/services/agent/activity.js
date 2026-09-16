// AI Activity Log — audit mọi tool call của assistant runtime (blueprint #5).
//
// Mọi tool call (ok / error / blocked bởi policy hoặc provenance) ghi vào
// bảng ai_activity_log với args + summary + session + turn. Admin tra cứu:
// debug, security, đánh giá agent, phát hiện hành xử bất thường.
//
// Ghi log là best-effort: lỗi DB/log không được phép làm gãy tool call —
// tương tự pattern audit.js (fail-open, console.error khi lỗi).

'use strict'

const pool = require('../../db.js')

/**
 * Cắt giá trị string sâu trong object/array (maxLen mỗi chuỗi) — giữ JSON
 * hợp lệ khi serialize (không cắt giữa escape sequence của JSON string).
 */
function truncateDeep(value, maxLen, depth = 0) {
  if (depth > 6) return '[deep]'
  if (typeof value === 'string') return value.length > maxLen ? value.slice(0, maxLen) + '…' : value
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => truncateDeep(v, maxLen, depth + 1))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value).slice(0, 20)) out[k] = truncateDeep(v, maxLen, depth + 1)
    return out
  }
  return value
}

/**
 * @param {Object} p
 * @param {string} p.sessionId
 * @param {number|null} p.userId
 * @param {string} p.agentName      — 'shopping' | 'merchant'
 * @param {string} p.agentId        — identity rate-limit (vd 'assistant:<hash>')
 * @param {string} p.tool
 * @param {'ok'|'error'|'blocked'} p.status
 * @param {Object}  [p.args]        — args model gọi (đã validate)
 * @param {string}  [p.summary]
 * @param {string}  [p.errorCode]
 * @param {number}  [p.sessionTurn]
 * @param {string}  [p.requestId]
 * @param {string}  [p.ip]
 */
async function logToolCall(p) {
  try {
    // args có thể chứa query text dài — JSON tối đa ~2KB, đủ debug không
    // phình DB. Cắt GIÁ TRỊ trước khi stringify (cắt chuỗi JSON giữa chừng
    // sẽ hỏng parse — không thể khôi phục với string bị cắt giữa).
    let argsJson = '{}'
    try { argsJson = JSON.stringify(truncateDeep(p.args ?? {}, 300)) } catch { argsJson = '{}' }
    if (argsJson.length > 2000) argsJson = argsJson.slice(0, 2000)
    await pool.query(
      `INSERT INTO ai_activity_log (session_id, user_id, agent_name, agent_id, tool, status, args, summary, error_code, session_turn, request_id, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
      [
        String(p.sessionId || '').slice(0, 100),
        p.userId ?? null,
        String(p.agentName || 'shopping').slice(0, 30),
        String(p.agentId || '').slice(0, 120),
        String(p.tool || '').slice(0, 60),
        p.status || 'ok',
        argsJson,
        String(p.summary || '').slice(0, 500),
        String(p.errorCode || '').slice(0, 40),
        Number.isInteger(p.sessionTurn) ? p.sessionTurn : null,
        String(p.requestId || '').slice(0, 40),
        p.ip ? String(p.ip).slice(0, 45) : null,
      ],
    )
  } catch (e) {
    console.error('[ai-activity] ghi log lỗi:', e.message)
  }
}

/**
 * Admin query: filter theo session/tool/status + phân trang.
 * @returns {{items, total}}
 */
async function listActivity({ sessionId, tool, status, limit = 50, offset = 0 } = {}) {
  const where = []
  const params = []
  const add = (col, val) => { params.push(val); where.push(`${col} = $${params.length}`) }
  if (sessionId) add('session_id', sessionId)
  if (tool) add('tool', tool)
  if (status) add('status', status)
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { rows: [count] } = await pool.query(`SELECT COUNT(*) AS n FROM ai_activity_log ${clause}`, params)
  const { rows } = await pool.query(
    `SELECT id, session_id, user_id, agent_name, tool, status, args, summary, error_code, session_turn, request_id, ip, created_at
     FROM ai_activity_log ${clause}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, Math.min(Math.max(1, limit), 200), Math.max(0, offset)],
  )
  return { items: rows, total: Number(count.n) }
}

/** Tóm tắt cho dashboard admin: số call theo tool + tỉ lệ lỗi (24h). */
async function activityStats() {
  const { rows: byTool } = await pool.query(
    `SELECT tool, status, COUNT(*) AS n FROM ai_activity_log
     WHERE created_at > now() - interval '24 hours'
     GROUP BY tool, status ORDER BY tool, status`)
  const { rows: [total] } = await pool.query(
    `SELECT COUNT(*) AS n FROM ai_activity_log WHERE created_at > now() - interval '24 hours'`)
  return { total24h: Number(total.n), byTool, funnel: await draftFunnel() }
}

// Funnel draft→claim→paid (7 ngày): token AI tạo → khách nhận → đơn paid.
// Đếm theo source_session để biết AI có ra tiền không.
async function draftFunnel() {
  const { rows } = await pool.query(
    `WITH drafts AS (
       SELECT source_session, MIN(created_at) AS drafted_at
       FROM cart_share_tokens WHERE source_session <> '' AND created_at > now() - interval '7 days'
       GROUP BY source_session
     ), claimed AS (
       SELECT DISTINCT source_session FROM cart_share_tokens
       WHERE source_session <> '' AND claimed_at IS NOT NULL AND created_at > now() - interval '7 days'
     ), paid AS (
       SELECT DISTINCT source_session FROM orders
       WHERE source_session <> '' AND payment_status = 'paid' AND created_at > now() - interval '7 days'
     )
     SELECT (SELECT COUNT(*) FROM drafts) AS drafted,
            (SELECT COUNT(*) FROM claimed) AS claimed,
            (SELECT COUNT(*) FROM paid) AS paid`)
  const r = rows[0] || { drafted: 0, claimed: 0, paid: 0 }
  const drafted = Number(r.drafted), claimed = Number(r.claimed), paid = Number(r.paid)
  return {
    drafted, claimed, paid,
    claimRate: drafted ? Math.round((claimed / drafted) * 100) : 0,
    paidRate: drafted ? Math.round((paid / drafted) * 100) : 0,
  }
}

module.exports = { logToolCall, listActivity, activityStats, draftFunnel }
