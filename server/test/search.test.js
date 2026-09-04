// Test search catalog trên DB thật (cần migrate 011/013 + seed).
// Run: npm run test:search trong server/
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const pool = require('../db.js')
const products = require('../services/products.js')

after(() => pool.end())

test('list không q: shape pagination đủ', async () => {
  const r = await products.listProducts({ limit: 2, page: 1 })
  assert.equal(r.items.length, 2)
  assert.ok(r.meta.total >= 2)
  assert.ok(r.meta.totalPages >= 1)
})

test('search chính xác: q=name trả đúng hàng', async () => {
  const r = await products.listProducts({ limit: 5, page: 1, q: 'vector' })
  assert.ok(r.meta.total >= 1)
  assert.ok(r.items[0].name.toLowerCase().includes('vector'))
  assert.equal(r.items[0].sim, undefined) // cột phụ không lọt ra API
})

test('search fuzzy: gõ sai vẫn ra (trigram)', async () => {
  const r = await products.listProducts({ limit: 5, page: 1, q: 'vectr' })
  assert.ok(r.meta.total >= 1)
  assert.ok(r.items.some((p) => p.slug.includes('vector')))
})

test('search case-insensitive', async () => {
  const lower = await products.listProducts({ limit: 5, page: 1, q: 'air vector' })
  const upper = await products.listProducts({ limit: 5, page: 1, q: 'AIR VECTOR' })
  assert.equal(lower.meta.total, upper.meta.total)
  assert.ok(lower.meta.total >= 1)
})
