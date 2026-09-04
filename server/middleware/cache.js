// Cache HTTP cho GET catalog — cache-aside qua services/cache.js.
// - Hit → trả ngay + X-Cache: HIT; miss → chạy handler, hứng res.json 2xx để ghi cache + X-Cache: MISS.
// - Luôn set Cache-Control để CDN/browser cache thêm 1 lớp (fail-open: cache lỗi → chạy tiếp).
const cache = require('../services/cache.js')

// keyFn(req) → string hậu tố key (phải bao mọi tham số ảnh hưởng response: query/user/...)
function cacheGet(namespace, ttlSec, keyFn, opts = {}) {
  return async (req, res, next) => {
    let key = null
    try {
      key = `v1:${namespace}:${keyFn(req)}`
      const hit = await cache.get(key)
      if (hit !== undefined) {
        res.set('X-Cache', 'HIT')
        res.set('Cache-Control', opts.cacheControl || 'public, max-age=30')
        return res.json(hit)
      }
    } catch { /* chạy handler bình thường */ }
    const origJson = res.json.bind(res)
    res.json = (body) => {
      if (key && res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
        cache.set(key, body, ttlSec).catch(() => {})
      }
      res.set('X-Cache', 'MISS')
      res.set('Cache-Control', opts.cacheControl || 'public, max-age=30')
      return origJson(body)
    }
    next()
  }
}

// Xóa cache theo namespace sau write (admin tạo/sửa product, review mới...).
// bust('products:list') xóa mọi key 'v1:products:list*' trên cả memory lẫn Redis.
async function bust(...namespaces) {
  await Promise.all(namespaces.map((n) => cache.del(`v1:${n}*`)))
}

module.exports = { cacheGet, bust }
