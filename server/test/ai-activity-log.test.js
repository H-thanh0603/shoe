// Test AI Activity Log (blueprint #5): logToolCall ghi ok/error/blocked,
// listActivity filter theo session/tool/status, activityStats 24h.
// Run: node --test test/ai-activity-log.test.js (cần DB)
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const activity = require('../services/agent/activity.js')
const { executeTool } = require('../services/agent/tools.js')
const pool = require('../db.js')

const SESS = 'test-ai-activity-session'

beforeEach(async () => {
  await pool.query('DELETE FROM ai_activity_log WHERE session_id = $1', [SESS])
})

test('logToolCall: ghi đầy đủ metadata (args, turn, request, ip)', async () => {
  await activity.logToolCall({
    sessionId: SESS, userId: 7, agentName: 'shopping', agentId: 'assistant:abc',
    tool: 'search_products', status: 'ok',
    args: { query: 'nike chạy bộ' }, summary: '18 kết quả',
    sessionTurn: 3, requestId: 'req-xyz', ip: '203.0.113.9',
  })
  const { items } = await activity.listActivity({ sessionId: SESS })
  assert.equal(items.length, 1)
  const row = items[0]
  assert.equal(row.tool, 'search_products')
  assert.equal(row.status, 'ok')
  assert.equal(row.user_id, 7)
  assert.equal(row.session_turn, 3)
  assert.equal(row.request_id, 'req-xyz')
  assert.deepEqual(row.args, { query: 'nike chạy bộ' })
})

test('logToolCall: error + blocked đều ghi, kèm error_code', async () => {
  await activity.logToolCall({ sessionId: SESS, tool: 'add_to_cart', status: 'blocked', args: { slug: 'x' }, summary: 'bị provenance gate chặn', errorCode: 'PROVENANCE_ERROR' })
  await activity.logToolCall({ sessionId: SESS, tool: 'get_product', status: 'error', args: { slug: 'khong-ton-tai' }, summary: 'tool lỗi', errorCode: 'PRODUCT_NOT_FOUND' })
  const { items, total } = await activity.listActivity({ sessionId: SESS })
  assert.equal(total, 2)
  const blocked = items.find((i) => i.status === 'blocked')
  assert.equal(blocked.error_code, 'PROVENANCE_ERROR')
  assert.equal(items.find((i) => i.status === 'error').error_code, 'PRODUCT_NOT_FOUND')
})

test('listActivity: filter theo tool + status, mới nhất trước', async () => {
  await activity.logToolCall({ sessionId: SESS, tool: 'get_memory', status: 'ok', args: {} })
  await new Promise((r) => setTimeout(r, 20)) // đảm bảo created_at khác nhau
  await activity.logToolCall({ sessionId: SESS, tool: 'get_memory', status: 'error', args: {}, errorCode: 'X' })
  const onlyErr = await activity.listActivity({ sessionId: SESS, tool: 'get_memory', status: 'error' })
  assert.equal(onlyErr.total, 1)
  assert.equal(onlyErr.items[0].status, 'error')
  // mới nhất trước (error ghi sau)
  const all = await activity.listActivity({ sessionId: SESS })
  assert.equal(all.items[0].status, 'error')
})

test('listActivity: phân trang limit/offset', async () => {
  for (let i = 0; i < 5; i++) {
    await activity.logToolCall({ sessionId: SESS, tool: 'search_products', status: 'ok', args: { i } })
  }
  const page1 = await activity.listActivity({ sessionId: SESS, limit: 3, offset: 0 })
  const page2 = await activity.listActivity({ sessionId: SESS, limit: 3, offset: 3 })
  assert.equal(page1.total, 5)
  assert.equal(page1.items.length, 3)
  assert.equal(page2.items.length, 2)
  assert.notEqual(page1.items[0].id, page2.items[0].id)
})

test('activityStats: nhóm theo tool + status trong 24h', async () => {
  const stats = await activity.activityStats()
  assert.ok(Number.isInteger(stats.total24h))
  assert.ok(Array.isArray(stats.byTool))
  assert.ok(stats.byTool.every((r) => r.tool && ['ok', 'error', 'blocked'].includes(r.status)))
})

test('logToolCall: args dài bị cắt ~2KB và vẫn là JSON hợp lệ (chống phình DB)', async () => {
  await pool.query('DELETE FROM ai_activity_log WHERE session_id = $1', [SESS])
  await activity.logToolCall({ sessionId: SESS, tool: 'search_products', status: 'ok', args: { query: 'x'.repeat(5000) } })
  const { items } = await activity.listActivity({ sessionId: SESS, tool: 'search_products' })
  assert.equal(items.length, 1)
  const row = items[0]
  // JSONB parse lại được (không bị cắt giữa escape sequence)
  assert.ok(row.args && typeof row.args === 'object')
  // và đã bị cắt ngắn hơn bản gốc 5000+ ký tự
  assert.ok(JSON.stringify(row.args).length <= 2100)
})

test('executeTool tích hợp: mọi outcome đều có dòng log tương ứng', async () => {
  await pool.query('DELETE FROM ai_activity_log WHERE session_id = $1', [SESS])
  const ctx = {
    role: 'assistant', agentId: 'act-test',
    req: { ip: '203.0.113.1', user: null, id: 'req-act' },
    sessionId: SESS, sessionTurn: 1,
    session: { seenSlugs: new Set(), seenShareUrls: new Set() }, // provenance gate cần session
  }
  // error: tool không tồn tại
  const r0 = await executeTool('tool_khong_co', {}, ctx)
  assert.equal(r0.ok, false)
  // error: args sai shape
  const r2 = await executeTool('get_product', { slug: '' }, ctx)
  assert.equal(r2.ok, false)
  // blocked: provenance gate — add_to_cart với slug chưa thấy
  const r3 = await executeTool('add_to_cart', { slug: 'chua-thay-bao-gio', size: 42 }, ctx)
  assert.equal(r3.ok, false)
  assert.equal(r3.result.error.code, 'PROVENANCE_ERROR')
  const { items } = await activity.listActivity({ sessionId: SESS })
  const statuses = items.map((i) => i.status)
  assert.ok(statuses.includes('blocked'), `mong blocked, có: ${statuses.join(',')}`)
  assert.ok(statuses.includes('error'), `mong error, có: ${statuses.join(',')}`)
})
