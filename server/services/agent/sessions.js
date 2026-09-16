// Session store — lịch sử chat agent. HAI chế độ storage:
//
// 1. memory (mặc định, dev/1-replica): LRU + TTL như cũ — 0 dependency.
// 2. redis (multi-instance qua nginx LB): session JSON sống trong Redis
//    (TTL như nhau) → replica nào nhận request cũng thấy cùng history.
//    Bật: AI_SESSION_STORE=redis (hoặc 'auto' — dùng redis nếu cache ready).
//
// Interface ĐỒNG BỘ giữ nguyên cho runtime (get/create/append/bumpTurn/
// atLimit/reset). Redis async tách rạch: hydrateAsync() ở ĐẦU mỗi turn kéo
// session về Map local (nếu chưa có), flushAsync() ĐẦU-CUỐI turn ghi lại.
// Trong 1 turn mọi mutation xảy ra trên Map (nhanh, nhất quán); Redis chỉ
// sync 2 điểm biên → không có race mid-turn giữa replica (cùng 1 request
// chỉ do 1 replica xử lý — nginx LB không tách stream).
//
// Fail-open theo pattern cache.js: Redis chết → memory vẫn chạy (chỉ mất
// tính share giữa replica, không mất availability).

'use strict'

const { set: cacheSet, get: cacheGet, del: cacheDel, info: cacheInfo } = require('../../services/cache.js')

// đọc env lúc gọi — đổi cấu hình/test không cần restart process
const maxSessions = () => Number(process.env.AI_MAX_SESSIONS) || 200
const maxTurns = () => Number(process.env.AI_MAX_TURNS) || 30
const SESSION_TTL_MS = Number(process.env.AI_SESSION_TTL_MS) || 2 * 60 * 60 * 1000
const REDIS_KEY = (sid) => `agent:sess:${sid}`

/** 'memory' | 'redis' | 'auto'. auto = redis nếu backend cache đã ready. */
function mode() {
  const raw = (process.env.AI_SESSION_STORE || 'auto').toLowerCase()
  if (raw === 'memory') return 'memory'
  if (raw === 'redis') return 'redis'
  return cacheInfo().backend === 'redis' ? 'redis' : 'memory'
}

/** @type {Map<string, {messages: Array, turns: number, lastSeen: number, seenSlugs: Set, seenShareUrls: Set}>} */
const sessions = new Map()
/** đang hydrate từ Redis (tránh hydrate đè turn đang chạy trên replica này) */
const hydrated = new Set()

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
    hydrated.delete(oldest)
  }
  const entry = { messages: [...initialMessages], turns: 0, lastSeen: Date.now(), seenSlugs: new Set(), seenShareUrls: new Set(), budget: null }
  sessions.set(sid, entry)
  return entry
}

/**
 * Budget tracking xuyên turn (shopping task state): { total, spent, items:[{label, priceVnd}] }.
 * Session TTL 2h — đủ cho 1 phiên mua sắm; qua phiên mới tính lại.
 */
function getBudget(sid) {
  return get(sid)?.budget || null
}

function setBudget(sid, totalVnd) {
  const s = get(sid) || create(sid)
  s.budget = { total: Number(totalVnd), spent: 0, items: [] }
  s.lastSeen = Date.now()
  return s.budget
}

function budgetAdd(sid, label, priceVnd) {
  const s = get(sid)
  if (!s?.budget) return null
  s.budget.items.push({ label: String(label).slice(0, 60), priceVnd: Number(priceVnd) })
  s.budget.spent = s.budget.items.reduce((t, i) => t + i.priceVnd, 0)
  s.lastSeen = Date.now()
  return s.budget
}

function budgetRemove(sid, label) {
  const s = get(sid)
  if (!s?.budget) return null
  const i = s.budget.items.findIndex((x) => x.label === label)
  if (i >= 0) s.budget.items.splice(i, 1)
  s.budget.spent = s.budget.items.reduce((t, i) => t + i.priceVnd, 0)
  s.lastSeen = Date.now()
  return s.budget
}

function budgetLine(b) {
  if (!b) return ''
  const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫'
  const rows = b.items.map((i) => `${i.label} ${vnd(i.priceVnd)}`).join('\n')
  return `Ngân sách: ${vnd(b.total)}\n${rows}\nĐã dùng: ${vnd(b.spent)} — Còn lại: ${vnd(b.total - b.spent)}`
}

/** append 1 message; tự tạo session nếu chưa có. */
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
  hydrated.delete(sid)
  // xóa cả Redis (user chủ động reset phiên — không để replica khác kéo lại)
  if (mode() === 'redis') cacheDel(REDIS_KEY(sid)).catch(() => {})
}

function stats() {
  return {
    sessions: sessions.size,
    maxSessions: maxSessions(),
    maxTurns: maxTurns(),
    store: mode(),
  }
}

// ————————————————————————————————————————————————
// Redis sync (async — gọi ở biên turn, KHÔNG trong vòng loop)
// ————————————————————————————————————————————————

/**
 * Đầu turn: nếu mode redis + session chưa có trong Map local → kéo từ Redis.
 * Không có trong Redis → session mới (Map entry mới, sẽ flush ở cuối turn).
 * Fail-open: lỗi Redis → giữ Map (session mới trên replica này).
 */
async function hydrateAsync(sid) {
  if (mode() !== 'redis' || hydrated.has(sid) || sessions.has(sid)) return
  hydrated.add(sid)
  try {
    const raw = await cacheGet(REDIS_KEY(sid))
    if (!raw) return // chưa từng có — Map tiếp tục như session mới
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw
    // seenSlugs/seenShareUrls serialize thành array — dựng lại Set
    if (Array.isArray(s.seenSlugs)) s.seenSlugs = new Set(s.seenSlugs)
    if (!s.seenSlugs) s.seenSlugs = new Set()
    if (Array.isArray(s.seenShareUrls)) s.seenShareUrls = new Set(s.seenShareUrls)
    if (!s.seenShareUrls) s.seenShareUrls = new Set()
    s.lastSeen = Date.now()
    sessions.set(sid, s)
    while (sessions.size > maxSessions()) { // LRU giữ kích thước
      const oldest = sessions.keys().next().value
      sessions.delete(oldest)
      hydrated.delete(oldest)
    }
  } catch { /* Redis lỗi — fail-open memory */ }
}

/**
 * Cuối turn (cả khi lỗi): đẩy session hiện tại lên Redis cho replica khác.
 * Không thể serialize vòng tròn — messages là JSON-able blocks chuẩn.
 */
async function flushAsync(sid) {
  if (mode() !== 'redis') return
  const s = sessions.get(sid)
  if (!s) return
  try {
    await cacheSet(REDIS_KEY(sid), {
      messages: s.messages,
      turns: s.turns,
      seenSlugs: [...s.seenSlugs],
      seenShareUrls: [...(s.seenShareUrls || [])],
      budget: s.budget || null,
      lastSeen: s.lastSeen,
    }, Math.ceil(SESSION_TTL_MS / 1000))
  } catch { /* fail-open */ }
}

/** Test/ops: xem session đã sync chưa. */
function isHydrated(sid) { return hydrated.has(sid) }

module.exports = {
  get, create, append, bumpTurn, turnCount, atLimit, reset, stats,
  hydrateAsync, flushAsync, isHydrated, mode,
  getBudget, setBudget, budgetAdd, budgetRemove, budgetLine,
}
