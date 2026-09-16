// Test merchant insights + business memory trên DB thật.
// Run: npm run test:merchant trong server/
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const pool = require('../db.js')
const ins = require('../services/merchant/insights.js')
const mem = require('../services/agent/memory.js')

before(async () => {
  await pool.query("DELETE FROM agent_memory WHERE session_key = 'biz'")
})

after(async () => {
  await pool.query("DELETE FROM agent_memory WHERE session_key = 'biz'")
  await pool.end()
})

test('briefing trả 4 dòng số thật', async () => {
  const b = await ins.briefing()
  assert.equal(b.lines.length, 4)
  assert.ok(Number.isInteger(b.lowStock))
})

test('anomaly không crash khi ít đơn', async () => {
  const a = await ins.anomaly()
  assert.ok('anomaly' in a)
  if (a.anomaly) assert.ok(a.likelyCauses.length > 0)
})

test('forecast + catalog audit + review intel shape đúng', async () => {
  const f = await ins.forecast({ days: 7 })
  assert.ok(Array.isArray(f.critical))
  const c = await ins.catalogAudit()
  assert.ok(Number.isInteger(c.total))
  const r = await ins.reviewIntel()
  assert.ok(Number.isInteger(r.total30d))
})

test('whyRevenue kỳ 0 đơn vẫn có line', async () => {
  const w = await ins.whyRevenue({ days: 7 })
  assert.ok(w.line.includes('Doanh thu'))
})

test('business memory whitelist + roundtrip', async () => {
  const bad = await mem.setBusiness(1, 'hack', 'x')
  assert.equal(bad.saved, false)
  const ok = await mem.setBusiness(1, 'margin_first', 'true')
  assert.equal(ok.saved, true)
  const rows = await mem.getBusiness()
  assert.ok(rows.some((r) => r.key === 'margin_first'))
  const prompt = await mem.businessForPrompt()
  assert.ok(prompt.includes('ưu tiên lợi nhuận'))
  const n = await mem.clearBusiness(1)
  assert.ok(n >= 1)
  assert.equal((await mem.getBusiness()).length, 0)
})
