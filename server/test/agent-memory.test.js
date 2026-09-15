// Test Agent Memory (blueprint #10): whitelist key, upsert explicit/inferred,
// resolveKey user vs anon, preferencesForPrompt.
// Run: node --test test/agent-memory.test.js (offline — cần DB cho SQL thật)
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const memory = require('../services/agent/memory.js')
const pool = require('../db.js')

const GUEST_REQ = { ip: '198.51.100.77', user: null }
const KEY = memory.resolveKey(GUEST_REQ).key

beforeEach(async () => {
  await pool.query('DELETE FROM agent_memory WHERE session_key = $1', [KEY])
})

test('resolveKey: guest → anon:<ip-hash>, không lộ IP', () => {
  const { key, userId } = memory.resolveKey(GUEST_REQ)
  assert.match(key, /^anon:[0-9a-f]{16}$/)
  assert.equal(userId, null)
  // cùng IP → cùng key (memory ổn định giữa các phiên)
  assert.equal(memory.resolveKey(GUEST_REQ).key, key)
})

test('resolveKey: user login → user:<id>', () => {
  const { key, userId } = memory.resolveKey({ ip: '1.2.3.4', user: { id: 42 } })
  assert.equal(key, 'user:42')
  assert.equal(userId, 42)
})

test('savePreferences: chuẩn hoá + chặn key ngoài whitelist', async () => {
  const results = await memory.savePreferences(KEY, [
    { key: 'preferred_brand', value: 'nike' },          // → NIKE (uppercase)
    { key: 'shoe_size', value: '42' },                  // hợp lệ
    { key: 'budget', value: 'under-2m' },               // hợp lệ
    { key: 'preferred_purpose', value: 'running' },     // hợp lệ
    { key: 'card_number', value: '4111111111111111' },  // KHÔNG whitelist → chặn
    { key: 'shoe_size', value: '99' },                  // ngoài 35–46 → chặn
  ])
  assert.equal(results.filter((r) => r.saved).length, 4)
  assert.equal(results.filter((r) => !r.saved).length, 2)
  assert.equal(results[0].value, 'NIKE')
  assert.ok(results[4].reason.includes('key không hợp lệ'))
  assert.ok(results[5].reason.includes('không hợp lệ'))
})

test('upsert: explicit đè inferred, inferred KHÔNG đè explicit', async () => {
  // inferred trước
  await memory.upsertPreference(KEY, { key: 'preferred_brand', value: 'ADIDAS', source: 'inferred' })
  let prefs = await memory.getPreferences(KEY)
  assert.equal(prefs.find((p) => p.key === 'preferred_brand').value, 'ADIDAS')
  // explicit đè
  await memory.upsertPreference(KEY, { key: 'preferred_brand', value: 'NIKE', source: 'explicit' })
  prefs = await memory.getPreferences(KEY)
  assert.equal(prefs.find((p) => p.key === 'preferred_brand').value, 'NIKE')
  assert.equal(prefs.find((p) => p.key === 'preferred_brand').source, 'explicit')
  // inferred SAU explicit → giữ explicit
  await memory.upsertPreference(KEY, { key: 'preferred_brand', value: 'PUMA', source: 'inferred' })
  prefs = await memory.getPreferences(KEY)
  assert.equal(prefs.find((p) => p.key === 'preferred_brand').value, 'NIKE')
  assert.equal(prefs.find((p) => p.key === 'preferred_brand').source, 'explicit')
})

test('upsert: inferred mới đè inferred cũ (mức confidence tăng dần)', async () => {
  await memory.upsertPreference(KEY, { key: 'preferred_purpose', value: 'running', source: 'inferred', confidence: 40 })
  await memory.upsertPreference(KEY, { key: 'preferred_purpose', value: 'trail', source: 'inferred', confidence: 60 })
  const prefs = await memory.getPreferences(KEY)
  const p = prefs.find((x) => x.key === 'preferred_purpose')
  assert.equal(p.value, 'trail')
  assert.ok(p.confidence >= 60)
})

test('preferencesForPrompt: render block có label tiếng Việt; rỗng khi chưa có', async () => {
  assert.equal(await memory.preferencesForPrompt(KEY), '')
  await memory.savePreferences(KEY, [
    { key: 'preferred_brand', value: 'NIKE' },
    { key: 'shoe_size', value: '42' },
  ])
  const block = await memory.preferencesForPrompt(KEY)
  assert.ok(block.includes('## Ghi nhớ về khách'))
  assert.ok(block.includes('brand ưa thích: NIKE'))
  assert.ok(block.includes('size giày: 42'))
  // inferred phải kèm cảnh báo suy đoán
  await memory.upsertPreference(KEY, { key: 'preferred_purpose', value: 'street', source: 'inferred' })
  const block2 = await memory.preferencesForPrompt(KEY)
  assert.ok(block2.includes('mục đích chính: street (suy đoán'))
})

test('MEMORY_KEYS whitelist không chứa key nhạy cảm', () => {
  const keys = Object.keys(memory.MEMORY_KEYS)
  for (const banned of ['card', 'address', 'email', 'password', 'phone', 'otp']) {
    assert.ok(!keys.some((k) => k.includes(banned)), `không được có key chứa "${banned}"`)
  }
})
