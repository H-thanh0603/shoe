// Rate-limit store shared giữa các instance qua services/cache.js:
// có Redis → đếm chung cả cụm; memory-only → đếm riêng từng process (ghi rõ trong log).
// Fixed window: windowMs đổi ra giây cho incrWithTtl.
const cache = require('../services/cache.js')

function sharedStore(prefix, windowMs) {
  const windowSec = Math.max(1, Math.round(windowMs / 1000))
  return {
    async increment(key) {
      const namespaced = `rl:${prefix}:${key}`
      const totalHits = await cache.incrWithTtl(namespaced, windowSec)
      return { totalHits, resetTime: new Date(Date.now() + windowMs) }
    },
    async decrement(key) { /* fixed window: không giảm (giữ đơn giản, đúng ý chống spam) */ },
    async resetKey(key) { await cache.del(`rl:${prefix}:${key}`) },
  }
}

module.exports = { sharedStore }
