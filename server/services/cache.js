// Cache layer — Redis (shared giữa các instance) + fallback memory LRU (dev/single instance).
// Không throw khi Redis chết: tự rớt về memory để request vẫn sống (fail-open).
// Dùng: const cache = require('./cache.js'); await cache.getOrSet('products:list:1:24:', 60, loader)
let Redis = null
try { Redis = require('ioredis') } catch { /* ioredis chưa cài — chạy memory-only */ }
const { redisUrl, cacheDefaultTtlSec, cacheMaxKeys } = require('../config.js')

// ——— memory LRU tối giản (Map giữ thứ tự insert, TTL mỗi key) ———
const mem = new Map() // key -> { val, exp }
const stats = { hits: 0, misses: 0, backend: 'memory' }

function memGet(key) {
  const e = mem.get(key)
  if (!e) return undefined
  if (e.exp && e.exp < Date.now()) { mem.delete(key); return undefined }
  // LRU: đọc xong đẩy xuống cuối
  mem.delete(key); mem.set(key, e)
  return e.val
}
function memSet(key, val, ttlSec) {
  if (mem.size >= cacheMaxKeys) mem.delete(mem.keys().next().value) // đuổi key cũ nhất
  mem.set(key, { val, exp: ttlSec > 0 ? Date.now() + ttlSec * 1000 : 0 })
}
function memDel(pattern) {
  if (!pattern) { mem.clear(); return }
  if (pattern.endsWith('*')) {
    const p = pattern.slice(0, -1)
    for (const k of [...mem.keys()]) if (k.startsWith(p)) mem.delete(k)
    return
  }
  mem.delete(pattern)
}

// ——— Redis (lazy, fail-open) ———
let redis = null
if (Redis && redisUrl) {
  redis = new Redis(redisUrl, {
    lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true,
    retryStrategy: (n) => (n > 3 ? null : Math.min(n * 200, 1000)),
  })
  redis.on('ready', () => { stats.backend = 'redis' })
  redis.on('end', () => { if (stats.backend === 'redis') stats.backend = 'memory' })
  redis.connect().catch(() => { redis = null }) // Redis chưa chạy — memory gánh
}
const redisOk = () => redis && redis.status === 'ready'

async function get(key) {
  if (redisOk()) {
    try {
      const raw = await redis.get(key)
      if (raw !== null) { stats.hits++; return JSON.parse(raw) }
    } catch { /* rớt xuống memory */ }
  }
  const v = memGet(key)
  if (v !== undefined) stats.hits++
  else stats.misses++
  return v
}

async function set(key, val, ttlSec = cacheDefaultTtlSec) {
  const raw = JSON.stringify(val)
  if (redisOk()) {
    try {
      if (ttlSec > 0) await redis.set(key, raw, 'EX', ttlSec)
      else await redis.set(key, raw)
    } catch { /* bỏ qua, vẫn ghi memory */ }
  }
  memSet(key, val, ttlSec)
}

async function del(prefixOrKey) {
  memDel(prefixOrKey)
  if (redisOk()) {
    try {
      if (!prefixOrKey) {
        // clear toàn bộ namespace của app (KHÔNG FLUSHDB — Redis có thể share với service khác)
        for (const ns of ['v1:*', 'rl:*']) {
          let cursor = '0'
          do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', ns, 'COUNT', 200)
            cursor = next
            if (keys.length) await redis.del(...keys)
          } while (cursor !== '0')
        }
      } else if (!prefixOrKey.includes('*')) {
        await redis.del(prefixOrKey) // key chính xác
      } else {
        // xóa theo prefix: SCAN (an toàn hơn KEYS trên production)
        const prefix = prefixOrKey.replace(/\*$/, '')
        let cursor = '0'
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', prefix + '*', 'COUNT', 200)
          cursor = next
          if (keys.length) await redis.del(...keys)
        } while (cursor !== '0')
      }
    } catch { /* memory đã xóa — đủ đúng */ }
  }
}

// Loader pattern: cache-aside. Chỉ cache khi loader thành công (loader throw → không ghi).
async function getOrSet(key, ttlSec, loader) {
  const hit = await get(key)
  if (hit !== undefined) return { val: hit, hit: true }
  const val = await loader()
  await set(key, val, ttlSec)
  return { val, hit: false }
}

// Counter cho rate-limit shared (Redis INCR + EXPIRE, fallback memory).
// Trả số hits trong window hiện tại.
async function incrWithTtl(key, ttlSec) {
  if (redisOk()) {
    try {
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, ttlSec)
      return n
    } catch { /* rớt memory */ }
  }
  const entry = mem.get(key)
  const alive = entry && (!entry.exp || entry.exp > Date.now()) && typeof entry.val === 'number'
  if (alive) {
    entry.val += 1
    mem.delete(key); mem.set(key, entry) // giữ nguyên exp → fixed window, LRU refresh
    return entry.val
  }
  memSet(key, 1, ttlSec)
  return 1
}

function info() {
  return { ...stats, memKeys: mem.size, redis: redisOk() ? 'ready' : 'off' }
}

module.exports = { get, set, del, getOrSet, incrWithTtl, info }
