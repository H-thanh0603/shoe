// Unit test cache layer + rate-limit store (memory backend, không cần Redis/DB).
// Run: npm test trong server/
const { test } = require('node:test')
const assert = require('node:assert/strict')
const cache = require('../services/cache.js')
const { sharedStore } = require('../middleware/rateStore.js')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('get/set: ghi rồi đọc lại đúng', async () => {
  await cache.set('ut:obj', { a: 1 }, 60)
  assert.deepEqual(await cache.get('ut:obj'), { a: 1 })
  assert.equal(await cache.get('ut:missing'), undefined)
})

test('getOrSet: loader chỉ chạy khi miss', async () => {
  let calls = 0
  const loader = async () => (++calls, { v: 42 })
  const r1 = await cache.getOrSet('ut:lazy', 60, loader)
  assert.equal(r1.hit, false)
  assert.deepEqual(r1.val, { v: 42 })
  const r2 = await cache.getOrSet('ut:lazy', 60, loader)
  assert.equal(r2.hit, true)
  assert.equal(calls, 1)
})

test('TTL: key hết hạn sau ttl', async () => {
  await cache.set('ut:ttl', 'x', 1)
  assert.equal(await cache.get('ut:ttl'), 'x')
  await sleep(1100)
  assert.equal(await cache.get('ut:ttl'), undefined)
})

test('del prefix: bust namespace không lan sang namespace khác', async () => {
  await cache.set('ut:ns:1', 1, 60)
  await cache.set('ut:ns:2', 2, 60)
  await cache.set('ut:other', 3, 60)
  await cache.del('ut:ns*')
  assert.equal(await cache.get('ut:ns:1'), undefined)
  assert.equal(await cache.get('ut:ns:2'), undefined)
  assert.equal(await cache.get('ut:other'), 3)
  await cache.del('ut:other')
  assert.equal(await cache.get('ut:other'), undefined)
})

test('incrWithTtl: đếm tăng trong window', async () => {
  const k = `ut:rl:${Date.now()}`
  assert.equal(await cache.incrWithTtl(k, 60), 1)
  assert.equal(await cache.incrWithTtl(k, 60), 2)
  assert.equal(await cache.incrWithTtl(k, 60), 3)
})

test('sharedStore: shape đúng cho express-rate-limit, key độc lập', async () => {
  const store = sharedStore('ut', 60 * 1000)
  const a1 = await store.increment('ip-a')
  const a2 = await store.increment('ip-a')
  const b1 = await store.increment('ip-b')
  assert.equal(a1.totalHits, 1)
  assert.equal(a2.totalHits, 2)
  assert.equal(b1.totalHits, 1)
  assert.ok(a2.resetTime instanceof Date)
  assert.ok(a2.resetTime.getTime() > Date.now())
})

test('info: báo backend + số key', () => {
  const i = cache.info()
  assert.ok(['memory', 'redis'].includes(i.backend))
  assert.equal(typeof i.memKeys, 'number')
})
