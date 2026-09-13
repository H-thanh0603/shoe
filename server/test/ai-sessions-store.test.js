// Test agent session store 2 chế độ: memory (mặc định) + redis sync
// (hydrateAsync/flushAsync — mô phỏng 2 replica qua store chung).
// Chạy: node --test test/ai-sessions-store.test.js
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

beforeEach(() => {
  delete process.env.AI_MAX_SESSIONS
  delete process.env.AI_MAX_TURNS
  delete process.env.AI_SESSION_STORE
})

// require mới mỗi lần để reset Map module-level
function freshSessions() {
  delete require.cache[require.resolve('../services/agent/sessions.js')]
  return require('../services/agent/sessions.js')
}

// ————————————————————————————————————————————————
// Memory mode (mặc định) — hành vi cũ phải nguyên vẹn
// ————————————————————————————————————————————————

test('memory mode: stats báo đúng store', () => {
  const s = freshSessions()
  assert.equal(s.stats().store, 'memory')
})

test('memory mode: hydrate/flush là no-op (không gọi cache)', async () => {
  const s = freshSessions()
  await s.hydrateAsync('m-noop') // không throw
  await s.flushAsync('m-noop') // không throw
  assert.equal(s.get('m-noop'), null)
})

// ————————————————————————————————————————————————
// Redis mode: roundtrip qua store chung = 2 replica
// ————————————————————————————————————————————————

test('redis mode: replica A flush → replica B hydrate thấy cùng history + seenSlugs + turns', async () => {
  process.env.AI_SESSION_STORE = 'redis'
  // store chung: cache.js memory backend (không cần Redis thật — cùng interface)
  const A = freshSessions()
  const sessA = A.create('shared-1')
  sessA.messages.push({ role: 'user', content: 'tìm giày' })
  sessA.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'ok' }] })
  sessA.seenSlugs.add('air-vector-01')
  A.bumpTurn('shared-1')
  A.bumpTurn('shared-1')
  await A.flushAsync('shared-1')

  // replica B: process khác — module state mới (Map rỗng)
  const B = freshSessions()
  assert.equal(B.get('shared-1'), null, 'B chưa có gì trong Map local')
  await B.hydrateAsync('shared-1')
  const sessB = B.get('shared-1')
  assert.ok(sessB, 'B thấy session sau hydrate')
  assert.equal(sessB.messages.length, 2)
  assert.deepEqual(sessB.messages[1].content, [{ type: 'text', text: 'ok' }])
  assert.ok(sessB.seenSlugs instanceof Set, 'seenSlugs dựng lại thành Set')
  assert.ok(sessB.seenSlugs.has('air-vector-01'), 'provenance giữ qua replica')
  assert.equal(sessB.turns, 2, 'turn cap đếm tiếp đúng')
})

test('redis mode: session mới (chưa flush) hydrate không tạo gì lạ', async () => {
  process.env.AI_SESSION_STORE = 'redis'
  const B = freshSessions()
  await B.hydrateAsync('chua-co-1')
  assert.equal(B.get('chua-co-1'), null, 'không có trong store → vẫn null')
})

test('redis mode: turn cap áp DỮ TRÊN replica khác (anti-abuse xuyên suốt)', async () => {
  process.env.AI_SESSION_STORE = 'redis'
  process.env.AI_MAX_TURNS = '2'
  const A = freshSessions()
  A.create('cap-1') // như runtime: get()||create() trước khi bump
  A.bumpTurn('cap-1')
  await A.flushAsync('cap-1')
  const B = freshSessions()
  await B.hydrateAsync('cap-1')
  assert.equal(B.turnCount('cap-1'), 1)
  assert.equal(B.atLimit('cap-1'), false, 'đã dùng 1/2')
  B.bumpTurn('cap-1')
  await B.flushAsync('cap-1')
  const C = freshSessions()
  await C.hydrateAsync('cap-1')
  assert.equal(C.atLimit('cap-1'), true, 'turn 2/2 → replica C chặn đúng')
})

test('redis mode: reset xóa cả store chung (replica khác không kéo lại được)', async () => {
  process.env.AI_SESSION_STORE = 'redis'
  const A = freshSessions()
  A.append('del-1', { role: 'user', content: 'x' })
  await A.flushAsync('del-1')
  A.reset('del-1')
  await new Promise((r) => setTimeout(r, 10)) // cacheDel async fire
  const B = freshSessions()
  await B.hydrateAsync('del-1')
  assert.equal(B.get('del-1'), null, 'đã reset → không sống lại')
})

test('auto mode: cache memory backend → store=memory; redis backend → redis', () => {
  const cache = require('../services/cache.js')
  const info = cache.info()
  const s = freshSessions()
  // auto: theo backend thật của cache tại require-time
  assert.equal(s.stats().store, info.backend === 'redis' ? 'redis' : 'memory')
})

test('runtime e2e: turn qua replica khác vẫn tiếp tục được history', async () => {
  process.env.AI_SESSION_STORE = 'redis'
  // mô phỏng: turn 1 chạy replica A (flush), turn 2 "replica B" hydrate + chạy
  const registry = require('../services/ai/registry.js')
  const { makeMockAdapter } = require('../services/ai/providers/mock.js')
  delete require.cache[require.resolve('../services/agent/index.js')]
  const agentA = require('../services/agent/index.js')
  const mock1 = makeMockAdapter({ script: [
    { content: [{ type: 'text', text: 'chào bạn, cần tìm gì?' }], stopReason: 'end_turn' },
  ] })
  const orig = registry.fallbackChain
  registry.fallbackChain = () => [mock1]
  for await (const ev of agentA.runTurn({ sessionId: 'e2e-multi-1', userMessage: 'chào', agentId: 't' })) { /* consume */ }
  registry.fallbackChain = orig
  // replica B: process khác — xoá TOÀN BỘ module tree agent để sessions
  // mới thật sự (runtime giữ reference sessions cũ nếu chỉ xoá index)
  delete require.cache[require.resolve('../services/agent/index.js')]
  delete require.cache[require.resolve('../services/agent/runtime.js')]
  delete require.cache[require.resolve('../services/agent/sessions.js')]
  const agentB = require('../services/agent/index.js')
  const sB = agentB.sessions.get('e2e-multi-1')
  assert.equal(sB, null, 'B chưa hydrate — Map rỗng')
  const mock2 = makeMockAdapter({ script: [
    { content: [{ type: 'text', text: 'tiếp tục nha' }], stopReason: 'end_turn' },
  ] })
  registry.fallbackChain = () => [mock2]
  let complete = null
  for await (const ev of agentB.runTurn({ sessionId: 'e2e-multi-1', userMessage: 'tiếp', agentId: 't' })) {
    if (ev.type === 'turn_complete') complete = ev
  }
  registry.fallbackChain = orig
  assert.ok(complete, 'turn 2 chạy OK trên B')
  const sB2 = agentB.sessions.get('e2e-multi-1')
  assert.ok(sB2.messages.length >= 4, 'history nối tiếp: user+assistant x2 (không bắt đầu lại)')
  assert.ok(sB2.messages.some((m) => m.role === 'assistant'), 'có lượt cũ')
})
