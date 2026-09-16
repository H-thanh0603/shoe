// Runner hit@k cho recommend_products — gọi trực tiếp handler (không HTTP, không LLM).
// Run: npm run eval:ranking (cần DATABASE_URL).
// Pass bar: hit@3 >= 0.75. Rớt → sửa matchScore hoặc golden (ghi lý do vào commit).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const pool = require('../db.js')
const agentTools = require('../routes/agentTools.js')
const GOLDEN = require('../eval/ranking-golden.js')

const tool = agentTools.TOOLS.find((t) => t.name === 'recommend_products')

function hitAtK(got, expected, k) {
  const top = got.slice(0, k)
  const hits = expected.filter((s) => top.includes(s)).length
  return hits / Math.min(k, expected.length)
}

test('eval ranking: hit@3 per case + average', async () => {
  let sum = 0
  for (const g of GOLDEN) {
    const res = await tool.handler({ ...g.args }, { agentId: 'eval', sessionId: 'eval' })
    const got = (res.recommendations || []).map((r) => r.slug)
    const h = hitAtK(got, g.expectTop3, 3)
    sum += h
    console.log(`  [${h >= 0.5 ? 'OK ' : 'MISS'}] "${g.q}" hit@3=${h.toFixed(2)} got=[${got.join(',')}] want~[${g.expectTop3.join(',')}]`)
  }
  const avg = sum / GOLDEN.length
  console.log(`  AVG hit@3 = ${avg.toFixed(2)} (bar 0.75)`)
  assert.ok(avg >= 0.75, `hit@3 trung bình ${avg.toFixed(2)} dưới bar 0.75`)
})

test('eval ranking: cleanup pool', async () => { await pool.end() })
