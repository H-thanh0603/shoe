// Test explicit planning + task state: plan artifact parser + end-to-end qua
// runtime (model viết <plan>/<step-done> trong text stream).
// Chạy: node --test test/ai-planning.test.js
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { makePlanTracker } = require('../services/agent/runtime.js')
const { makeMockAdapter } = require('../services/ai/providers/mock.js')

beforeEach(() => {
  delete process.env.AI_MAX_ROUNDS
  delete process.env.AI_MAX_TURNS
})

function withProviders(chain, fn) {
  const registry = require('../services/ai/registry.js')
  const orig = registry.fallbackChain
  registry.fallbackChain = () => chain
  return Promise.resolve(fn()).finally(() => { registry.fallbackChain = orig })
}

async function collectTurn(agent, opts) {
  const events = []
  for await (const ev of agent.runTurn(opts)) events.push(ev)
  return events
}

// ————————————————————————————————————————————————
// Parser thuần: feed từng ký tự (thách nhất — tag cắt giữa chừng)
// ————————————————————————————————————————————————

test('parser: plan + step-done hoàn chỉnh, từng ký tự', () => {
  const t = makePlanTracker()
  const events = []
  const s = 'Trước. <plan><step>B1: tìm</step><step>B2: thêm giỏ</step></plan> Làm. <step-done>B1: xong</step-done> Hết.'
  for (const ch of s) for (const a of t.chunk(ch)) events.push(a)
  for (const a of t.flush()) events.push(a)
  const plan = events.find((e) => e.emit === 'plan')
  const done = events.find((e) => e.emit === 'step_done')
  assert.deepEqual(plan.steps, ['B1: tìm', 'B2: thêm giỏ'])
  assert.equal(done.label, 'B1: xong')
  // text user thấy KHÔNG lẫn tag
  const text = events.filter((e) => e.emit === 'text').map((e) => e.text).join('')
  assert.ok(!text.includes('<plan>'))
  assert.ok(!text.includes('<step'))
  assert.ok(!text.includes('</plan>'))
  assert.ok(text.includes('Trước.'))
  assert.ok(text.includes('Làm.'))
})

test('parser: chunk lớn (mock 8 ký tự + cả block 1 lần) — cùng kết quả', () => {
  const s = 'A <plan><step>B1: so sánh 2 giày</step><step>B2: chọn</step></plan> B <step-done>B1: xong — 2 giày</step-done> C'
  for (const size of [1, 3, 8, 1000]) {
    const t = makePlanTracker()
    const events = []
    for (let i = 0; i < s.length; i += size) {
      for (const a of t.chunk(s.slice(i, i + size))) events.push(a)
    }
    for (const a of t.flush()) events.push(a)
    const plan = events.find((e) => e.emit === 'plan')
    assert.ok(plan, `size ${size}: phải có plan`)
    assert.deepEqual(plan.steps, ['B1: so sánh 2 giày', 'B2: chọn'], `size ${size}`)
    const done = events.find((e) => e.emit === 'step_done')
    assert.ok(done, `size ${size}: phải có step_done`)
    assert.ok(done.label.startsWith('B1:'), `size ${size}`)
  }
})

test('parser: KHÔNG có plan — text nguyên vẹn không đụng gì', () => {
  const t = makePlanTracker()
  const events = []
  for (const ch of 'chào bạn, giày này 2 triệu') for (const a of t.chunk(ch)) events.push(a)
  for (const a of t.flush()) events.push(a)
  assert.equal(events.filter((e) => e.emit !== 'text').length, 0)
  assert.equal(events.map((e) => e.text).join(''), 'chào bạn, giày này 2 triệu')
})

test('parser: <step> rác ngoài plan bị bỏ, text quanh nó giữ nguyên', () => {
  const t = makePlanTracker()
  const events = []
  for (const ch of 'a <step>rác</step> b') for (const a of t.chunk(ch)) events.push(a)
  for (const a of t.flush()) events.push(a)
  assert.equal(events.filter((e) => e.emit === 'plan').length, 0)
  const text = events.map((e) => e.text).join('')
  assert.ok(!text.includes('<step'))
  assert.ok(text.includes('a ') && text.includes(' b'))
})

test('parser: plan dở không đóng </plan> → flush KHÔNG emit plan rác', () => {
  const t = makePlanTracker()
  const events = []
  for (const ch of 'x <plan><step>B1') for (const a of t.chunk(ch)) events.push(a)
  for (const a of t.flush()) events.push(a)
  assert.equal(events.filter((e) => e.emit === 'plan').length, 0)
  assert.equal(events.filter((e) => e.emit === 'step_done').length, 0)
})

test('parser: nhiều step-done trong 1 turn', () => {
  const t = makePlanTracker()
  const events = []
  const s = '<plan><step>B1</step><step>B2</step></plan><step-done>B1: ok1</step-done>gì đó<step-done>B2: ok2</step-done>'
  for (const ch of s) for (const a of t.chunk(ch)) events.push(a)
  for (const a of t.flush()) events.push(a)
  const dones = events.filter((e) => e.emit === 'step_done')
  assert.equal(dones.length, 2)
  assert.equal(dones[0].label, 'B1: ok1')
  assert.equal(dones[1].label, 'B2: ok2')
})

// ————————————————————————————————————————————————
// End-to-end qua runtime (mock scripted có plan trong text + tool call)
// ————————————————————————————————————————————————

test('runtime: model viết plan → tool → step-done → events đúng thứ tự', async () => {
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter({ script: [
    { content: [
        { type: 'text', text: '<plan><step>B1: tìm giày running</step><step>B2: thêm vào giỏ</step></plan>' },
        { type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'air', limit: 3 } },
      ], stopReason: 'tool_use' },
    { content: [
        { type: 'text', text: '<step-done>B1: xong — thấy 2 giày</step-done>Tôi thấy 2 giày chạy bộ phù hợp.' },
      ], stopReason: 'end_turn' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'plan-e2e-1', userMessage: 'tìm rồi thêm giùm', agentId: 'test' }))
  const types = events.map((e) => e.type)
  const planIdx = types.indexOf('plan')
  const toolIdx = types.indexOf('tool')
  const doneIdx = types.indexOf('step_done')
  assert.ok(planIdx >= 0, 'có event plan')
  assert.ok(toolIdx >= 0, 'có event tool')
  assert.ok(doneIdx >= 0, 'có event step_done')
  assert.ok(planIdx < toolIdx, 'plan đến TRƯỚC tool (artifact trước khi làm)')
  assert.ok(toolIdx < doneIdx, 'step_done đến SAU tool (quan sát kết quả)')
  const plan = events[planIdx]
  assert.deepEqual(plan.steps, ['B1: tìm giày running', 'B2: thêm vào giỏ'])
  const done = events[doneIdx]
  assert.ok(String(done.label).startsWith('B1'))
  // text user thấy không lẫn tag
  const text = events.filter((e) => e.type === 'text').map((e) => e.text).join('')
  assert.ok(!text.includes('<plan>') && !text.includes('<step'))
  assert.ok(text.includes('Tôi thấy 2 giày'))
})

test('runtime: model không viết plan (việc đơn giản) — không có event plan, text thường', async () => {
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter({ script: [
    { content: [{ type: 'text', text: 'Giày court-vision đang giảm còn 1,2 triệu nha.' }], stopReason: 'end_turn' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'plan-e2e-none', userMessage: 'giày court bao nhiêu?', agentId: 'test' }))
  assert.equal(events.filter((e) => e.type === 'plan').length, 0)
  assert.equal(events.filter((e) => e.type === 'step_done').length, 0)
  const text = events.filter((e) => e.type === 'text').map((e) => e.text).join('')
  assert.ok(text.includes('1,2 triệu'))
})

test('runtime: plan nhiều round (round 2 viết tiếp step-done) — mỗi round 1 tracker riêng', async () => {
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter({ script: [
    { content: [
        { type: 'text', text: '<plan><step>B1: tìm</step><step>B2: thêm</step></plan>' },
        { type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'air', limit: 2 } },
      ], stopReason: 'tool_use' },
    { content: [
        { type: 'text', text: '<step-done>B1: xong</step-done>Giày đây ạ.' },
      ], stopReason: 'end_turn' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'plan-e2e-multi', userMessage: 'tìm giùm', agentId: 'test' }))
  assert.equal(events.filter((e) => e.type === 'plan').length, 1)
  assert.equal(events.filter((e) => e.type === 'step_done').length, 1)
})
