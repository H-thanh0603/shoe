// Session store — lịch sử chat agent (in-memory LRU, TTL).
//
// Theo pattern bridge.py cũ (MAX_SESSIONS/MAX_TURNS) nhưng Node: mỗi phiên
// giữ messages chuẩn nội bộ (Anthropic content blocks), giới hạn turn để không
// phình context + tốn tiền. Multi-instance → move sang Redis (services/cache.js)
// khi cần — interface giữ get/append/reset để thay storage sau dễ.

'use strict'

// đọc env lúc gọi — đổi cấu hình/test không cần restart process
const maxSessions = () => Number(process.env.AI_MAX_SESSIONS) || 200
const maxTurns = () => Number(process.env.AI_MAX_TURNS) || 30
const SESSION_TTL_MS = Number(process.env.AI_SESSION_TTL_MS) || 2 * 60 * 60 * 1000

/** @type {Map<string, {messages: Array, turns: number, lastSeen: number}>} */
const sessions = new Map()

function get(sid) {
  const s = sessions.get(sid)
  if (!s) return null
  if (Date.now() - s.lastSeen > SESSION_TTL_MS) {
    sessions.delete(sid)
    return null
  }
  // LRU touch — giữ tham chiếu ĐẦY ĐỦ (mutate s trực tiếp để bumpTurn/append
  // thấy cùng object với map)
  s.lastSeen = Date.now()
  sessions.delete(sid)
  sessions.set(sid, s)
  return s
}

function create(sid, initialMessages = []) {
  if (sessions.has(sid)) sessions.delete(sid)
  // đuổi session cũ nhất khi đầy (LRU: đầu map là ít dùng nhất)
  while (sessions.size >= maxSessions()) {
    const oldest = sessions.keys().next().value
    sessions.delete(oldest)
  }
  const entry = { messages: [...initialMessages], turns: 0, lastSeen: Date.now() }
  sessions.set(sid, entry)
  return entry
}

/** append 1 message; tự tạo session nếu chưa có. Trả false nếu quá MAX_TURNS. */
function append(sid, message) {
  let s = get(sid) || create(sid)
  s.messages.push(message)
  s.lastSeen = Date.now()
  return s
}

function bumpTurn(sid) {
  const s = get(sid)
  if (!s) return 0
  s.turns += 1
  return s.turns
}

function turnCount(sid) {
  return get(sid)?.turns ?? 0
}

/** Đã chạm trần turn → từ chối thêm (cho route trả 429-friendly message). */
function atLimit(sid) {
  return turnCount(sid) >= maxTurns()
}

function reset(sid) {
  sessions.delete(sid)
}

function stats() {
  return { sessions: sessions.size, maxSessions: maxSessions(), maxTurns: maxTurns() }
}

module.exports = { get, create, append, bumpTurn, turnCount, atLimit, reset, stats }
