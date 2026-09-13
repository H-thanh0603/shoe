// Test agent runtime + AI client (offline — mock/scripted providers, không
// network, không key). Run: node --test test/ai-agent-runtime.test.js
//
// Bao phủ:
//  - aiStream fallback: provider 1 lỗi retryable hết retry → provider 2 chạy
//  - aiStream KHÔNG fallback sau khi đã emit text (user đã thấy)
//  - aiChat lỗi không fallbackEligible (BAD_REQUEST) → bubble
//  - runtime: vòng tool_use → execute → tool_result → vòng cuối text
//  - runtime: maxRounds dừng đúng
//  - runtime: tool không có trong policy → TOOL_NOT_ALLOWED result
//  - sessions: LRU + turn cap
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const { makeMockAdapter } = require('../services/ai/providers/mock.js')
const { AIError } = require('../services/ai/types.js')

// reset env trước mỗi test (tránh dirty state giữa các test trong file)
beforeEach(() => {
  delete process.env.AI_PROVIDER
  delete process.env.AI_MAX_ROUNDS
  delete process.env.AI_MAX_RETRIES
  delete process.env.AI_MAX_SESSIONS
  delete process.env.AI_MAX_TURNS
})

function flakyAdapter({ failTimes = 1, error }) {
  let calls = 0
  const err = error || new AIError('RATE_LIMIT', 'qua rate limit', { status: 429 })
  return {
    id: 'flaky',
    displayName: 'Flaky',
    capabilities: () => ({ streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false }),
    async generate() {
      calls++
      if (calls <= failTimes) throw err
      return { content: [{ type: 'text', text: 'ok sau retry' }], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 }, model: 'flaky-m', provider: 'flaky' }
    },
    info: () => ({ configured: true, model: 'flaky-m' }),
    _calls: () => calls,
  }
}

function deadAdapter(error) {
  return {
    id: 'dead',
    displayName: 'Dead',
    capabilities: () => ({ streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false }),
    async generate() { throw error },
    async* stream() { throw error },
    info: () => ({ configured: true, model: 'dead-m' }),
  }
}

// ————————————————————————————————————————————————
// aiChat: retry + fallback
// ————————————————————————————————————————————————

test('aiChat: provider lỗi retryable → retry thành công (không fallback)', async () => {
  const registry = require('../services/ai/registry.js')
  const client = require('../services/ai/client.js')
  const flaky = flakyAdapter({ failTimes: 1 })
  const fallback = makeMockAdapter()
  const orig = registry.fallbackChain
  registry.fallbackChain = () => [flaky, fallback]
  try {
    process.env.AI_MAX_RETRIES = '2'
    process.env.AI_RETRY_BASE_MS = '1'
    const result = await client.aiChat({ messages: [{ role: 'user', content: 'x' }] })
    assert.equal(result.content[0].text, 'ok sau retry')
    assert.equal(flaky._calls(), 2)
  } finally {
    registry.fallbackChain = orig
  }
})

test('aiChat: provider chết hết retry → fallback provider 2', async () => {
  const registry = require('../services/ai/registry.js')
  const client = require('../services/ai/client.js')
  const fallback = makeMockAdapter({ staticText: 'từ provider 2' })
  const orig = registry.fallbackChain
  registry.fallbackChain = () => [deadAdapter(new AIError('SERVER', '500', { status: 500 })), fallback]
  try {
    process.env.AI_MAX_RETRIES = '1'
    process.env.AI_RETRY_BASE_MS = '1'
    const result = await client.aiChat({ messages: [{ role: 'user', content: 'x' }] })
    assert.equal(result.provider, 'mock')
    assert.ok(result.content[0].text.includes('từ provider 2'))
  } finally {
    registry.fallbackChain = orig
  }
})

test('aiChat: BAD_REQUEST không fallback (lỗi nội dung) — bubble lên', async () => {
  const registry = require('../services/ai/registry.js')
  const client = require('../services/ai/client.js')
  const fallback = makeMockAdapter()
  const orig = registry.fallbackChain
  registry.fallbackChain = () => [deadAdapter(new AIError('BAD_REQUEST', 'prompt quá dài', { status: 400 })), fallback]
  try {
    process.env.AI_MAX_RETRIES = '1'
    await assert.rejects(
      client.aiChat({ messages: [{ role: 'user', content: 'x' }] }),
      (e) => e.code === 'BAD_REQUEST',
    )
  } finally {
    registry.fallbackChain = orig
  }
})

test('aiStream: fallback được — stream chưa emit gì', async () => {
  const registry = require('../services/ai/registry.js')
  const client = require('../services/ai/client.js')
  const fallback = makeMockAdapter({ staticText: 'đã fallback' })
  const orig = registry.fallbackChain
  registry.fallbackChain = () => [deadAdapter(new AIError('TIMEOUT', 'treo', { status: 408 })), fallback]
  try {
    process.env.AI_MAX_RETRIES = '0'
    const events = []
    for await (const ev of client.aiStream({ messages: [{ role: 'user', content: 'x' }] })) events.push(ev.type)
    assert.ok(events.includes('text_delta'))
    assert.ok(events.includes('final'))
  } finally {
    registry.fallbackChain = orig
  }
})

test('aiStream: đã emit text → KHÔNG fallback (bubble lỗi)', async () => {
  const registry = require('../services/ai/registry.js')
  const client = require('../services/ai/client.js')
  const fallback = makeMockAdapter({ staticText: 'nội dung lặp' })
  // stream provider: emit 1 text_delta rồi chết
  const halfStream = {
    id: 'half',
    displayName: 'HalfStream',
    capabilities: () => ({ streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false }),
    info: () => ({ configured: true, model: 'half-m' }),
    async* stream() {
      yield { type: 'text_delta', text: 'một nửa', index: 0 }
      throw new AIError('SERVER', 'chết giữa stream', { status: 502 })
    },
  }
  const orig = registry.fallbackChain
  registry.fallbackChain = () => [halfStream, fallback]
  try {
    process.env.AI_MAX_RETRIES = '2'
    process.env.AI_RETRY_BASE_MS = '1'
    let got = ''
    await assert.rejects(
      (async () => {
        for await (const ev of client.aiStream({ messages: [{ role: 'user', content: 'x' }] })) {
          if (ev.type === 'text_delta') got += ev.text
        }
      })(),
      (e) => e.code === 'SERVER',
    )
    assert.equal(got, 'một nửa') // text đã stream vẫn ra; không re-stream
  } finally {
    registry.fallbackChain = orig
  }
})

// ————————————————————————————————————————————————
// agent runtime (scripted mock — tool loop)
// ————————————————————————————————————————————————

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

test('runtime: vòng tool_use → execute → tool_result → vòng cuối text', async () => {
  // NOTE: cần fresh sessions tránh rớt theo sid cũ
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter({ script: [
    { content: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'running', limit: 2 } }], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Tôi thấy 2 giày chạy bộ phù hợp, cả hai còn size 42.' }], stopReason: 'end_turn' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'rt-tool-1', userMessage: 'giày chạy bộ', agentId: 'test' }))
  const tools = events.filter((e) => e.type === 'tool')
  const results = events.filter((e) => e.type === 'tool_result')
  const texts = events.filter((e) => e.type === 'text').map((e) => e.text).join('')
  const complete = events.find((e) => e.type === 'turn_complete')
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'search_products')
  assert.equal(results[0].status, 'ok')
  assert.ok(texts.includes('Tôi thấy 2 giày'))
  assert.equal(complete.rounds, 2)
  // history lưu đúng chuẩn tool_result
  const s = agent.sessions.get('rt-tool-1')
  const lastUser = s.messages.filter((m) => m.role === 'user').pop()
  assert.equal(lastUser.content[0].type, 'tool_result')
  assert.equal(lastUser.content[0].tool_use_id, 't1')
})

test('runtime: tool args sai schema → INVALID_TOOL_ARGS result lỗi, không crash loop', async () => {
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter({ script: [
    { content: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { limit: 999 } }], stopReason: 'tool_use' }, // thiếu query + limit > max
    { content: [{ type: 'text', text: 'Tôi cần thêm từ khóa — bạn tìm giày gì?' }], stopReason: 'end_turn' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'rt-badargs-1', userMessage: 'tìm giày', agentId: 'test' }))
  const results = events.filter((e) => e.type === 'tool_result')
  assert.equal(results[0].status, 'error')
  assert.ok(results[0].summary.includes('shape'))
})

test('runtime: tool lạ/không cho phép → lỗi có cấu trúc, model tiếp tục vòng', async () => {
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter({ script: [
    { content: [{ type: 'tool_use', id: 't1', name: 'tool_khong_ton_tai', input: {} }], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Tôi không có tool đó — để tôi tìm theo cách khác.' }], stopReason: 'end_turn' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'rt-unknown-1', userMessage: 'x', agentId: 'test' }))
  const results = events.filter((e) => e.type === 'tool_result')
  assert.equal(results[0].status, 'error')
  assert.ok(events.find((e) => e.type === 'turn_complete'))
})

test('runtime: maxRounds chặn vòng lặp tool vô hạn', async () => {
  process.env.AI_MAX_ROUNDS = '3'
  const agent = require('../services/agent/index.js')
  // mock luôn gọi tool → runtime buộc dừng ở maxRounds
  const mock = makeMockAdapter({ script: [
    { content: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'loop' } }], stopReason: 'tool_use' },
  ] })
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'rt-maxrounds-1', userMessage: 'loop', agentId: 'test' }))
  const toolCalls = events.filter((e) => e.type === 'tool')
  assert.ok(toolCalls.length <= 3, `muộn vòng: ${toolCalls.length}`)
  assert.ok(events.find((e) => e.type === 'turn_complete'))
})

test('runtime: session quá turn → từ chối lịch sự', async () => {
  process.env.AI_MAX_TURNS = '1'
  const agent = require('../services/agent/index.js')
  const mock = makeMockAdapter()
  const events = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'rt-cap-1', userMessage: 'lượt 1', agentId: 'test' }))
  assert.ok(events.find((e) => e.type !== 'error'))
  const events2 = await withProviders([mock], () =>
    collectTurn(agent, { sessionId: 'rt-cap-1', userMessage: 'lượt 2', agentId: 'test' }))
  const err = events2.find((e) => e.type === 'error')
  assert.ok(err)
  assert.ok(err.message.includes('quá dài'))
  delete process.env.AI_MAX_TURNS
})

// ————————————————————————————————————————————————
// sessions LRU
// ————————————————————————————————————————————————

test('sessions: đuổi cũ nhất khi đầy (LRU)', () => {
  process.env.AI_MAX_SESSIONS = '3'
  const sessions = require('../services/agent/sessions.js')
  sessions.create('s1')
  sessions.create('s2')
  sessions.create('s3')
  sessions.get('s1') // touch s1 → s2 giờ là oldest
  sessions.create('s4')
  assert.equal(sessions.get('s2'), null, 's2 bị đuổi')
  assert.notEqual(sessions.get('s1'), null)
  assert.notEqual(sessions.get('s4'), null)
  delete process.env.AI_MAX_SESSIONS
})

afterEach(() => {
  // dọn module cache để test sau không thấy env dirty
  for (const p of ['../services/agent/sessions.js', '../services/agent/runtime.js']) {
    delete require.cache[require.resolve(p)]
  }
})
