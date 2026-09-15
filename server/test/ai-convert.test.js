// Test AI layer offline: convert shapes (Anthropic ⇄ OpenAI ⇄ Gemini),
// capability resolution, registry env parsing, mock provider + agent runtime
// loop với scripted tool-calls. KHÔNG network, KHÔNG key.
// Run: node --test test/ai-providers.test.js
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const {
  messagesToOpenai, toolToOpenai, toolToGemini, systemToText,
  toolChoiceToOpenai, openaiToResult, geminiToResult, toolResultToText,
  sanitizeSchemaForGemini,
} = require('../services/ai/convert.js')
const { resolveCapabilities } = require('../services/ai/capabilities.js')
const { AIError } = require('../services/ai/types.js')

beforeEach(() => {
  delete process.env.AI_MODEL_CAPABILITIES
  delete process.env.AI_PROVIDER
  delete process.env.AI_API_KEY
  for (const k of ['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) delete process.env[k]
})

// ————————————————————————————————————————————————
// convert: messages Anthropic (internal) → OpenAI
// ————————————————————————————————————————————————

test('messagesToOpenai: string content giữ nguyên', () => {
  const out = messagesToOpenai([{ role: 'user', content: 'xin chào' }])
  assert.deepEqual(out, [{ role: 'user', content: 'xin chào' }])
})

test('messagesToOpenai: tool_use → assistant tool_calls, tool_result → role:tool', () => {
  const out = messagesToOpenai([
    { role: 'user', content: 'tìm giày' },
    { role: 'assistant', content: [
      { type: 'text', text: 'để tôi tìm' },
      { type: 'tool_use', id: 'tu_1', name: 'search_products', input: { query: 'giày' } },
    ] },
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu_1', content: '[]', is_error: false },
    ] },
  ])
  assert.equal(out.length, 3)
  assert.equal(out[1].role, 'assistant')
  assert.equal(out[1].tool_calls[0].function.name, 'search_products')
  assert.deepEqual(JSON.parse(out[1].tool_calls[0].function.arguments), { query: 'giày' })
  assert.equal(out[2].role, 'tool')
  assert.equal(out[2].tool_call_id, 'tu_1')
})

test('messagesToOpenai: tool_result phải theo sau assistant có tool_calls (không block rời)', () => {
  // history đúng chuẩn runtime: assistant(tool_use) → user(tool_result)
  const out = messagesToOpenai([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't9', name: 'x', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't9', content: 'ok' }] },
  ])
  assert.equal(out[0].tool_calls.length, 1)
  assert.equal(out[1].role, 'tool')
})

test('messagesToOpenai: bỏ message assistant rỗng hoàn toàn', () => {
  const out = messagesToOpenai([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }] }, // chỉ thinking → text rỗng
  ])
  // assistant chỉ có thinking → content null và không tool_calls → bị bỏ
  assert.ok(out.every((m) => m.content !== null || m.tool_calls))
})

test('systemToText: blocks → join text, bỏ cache_control', () => {
  const out = systemToText([
    { type: 'text', text: 'Phần A' },
    { type: 'text', text: 'Phần B', cache_control: { type: 'ephemeral' } },
  ])
  assert.equal(out, 'Phần A\n\nPhần B')
})

test('toolResultToText: block list → join text', () => {
  assert.equal(toolResultToText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'a\nb')
  assert.equal(toolResultToText({ content: 'plain' }), 'plain')
  assert.equal(JSON.parse(toolResultToText({ content: { a: 1 } })).a, 1)
})

// ————————————————————————————————————————————————
// convert: tools
// ————————————————————————————————————————————————

test('toolToOpenai: JSON Schema → function.parameters', () => {
  const spec = { name: 'x', description: 'd', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }
  const out = toolToOpenai(spec)
  assert.equal(out.type, 'function')
  assert.equal(out.function.name, 'x')
  assert.deepEqual(out.function.parameters.required, ['q'])
})

test('toolToGemini: strip $schema/additionalProperties đệ quy', () => {
  const schema = {
    type: 'object',
    $schema: 'http://x',
    additionalProperties: false,
    properties: {
      nested: { type: 'object', $schema: 'http://x', additionalProperties: false, properties: { a: { type: 'string' } } },
      arr: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { b: { type: 'integer' } } } },
    },
  }
  const out = sanitizeSchemaForGemini(schema)
  assert.equal(out.$schema, undefined)
  assert.equal(out.additionalProperties, undefined)
  assert.equal(out.properties.nested.$schema, undefined)
  assert.equal(out.properties.arr.items.additionalProperties, undefined)
  // type không bị mất
  assert.equal(out.properties.nested.properties.a.type, 'string')
})

test('toolChoiceToOpenai', () => {
  assert.equal(toolChoiceToOpenai('auto'), 'auto')
  assert.equal(toolChoiceToOpenai('none'), 'none')
  assert.deepEqual(toolChoiceToOpenai({ type: 'tool', name: 'x' }), { type: 'function', function: { name: 'x' } })
  assert.equal(toolChoiceToOpenai(undefined), undefined)
})

// ————————————————————————————————————————————————
// convert: response → internal result
// ————————————————————————————————————————————————

test('openaiToResult: text + tool_calls + usage', () => {
  const r = openaiToResult({
    model: 'deepseek-chat',
    choices: [{ finish_reason: 'tool_calls', message: {
      content: 'để tôi tìm',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_products', arguments: '{"query":"giày"}' } }],
    } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }, { model: 'x', provider: 'deepseek' })
  assert.equal(r.stopReason, 'tool_use')
  assert.equal(r.content[0].type, 'text')
  assert.equal(r.content[1].type, 'tool_use')
  assert.deepEqual(r.content[1].input, { query: 'giày' })
  assert.equal(r.usage.inputTokens, 10)
  assert.equal(r.provider, 'deepseek')
})

test('openaiToResult: arguments JSON hỏng → input._raw, không crash', () => {
  const r = openaiToResult({
    choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{oops' } }] } }],
  }, { model: 'x', provider: 'p' })
  assert.ok(typeof r.content[0].input._raw === 'string')
})

test('openaiToResult: cache tokens chuẩn hoá từ prompt_tokens_details', () => {
  const r = openaiToResult({
    choices: [{ finish_reason: 'stop', message: { content: 'hi' } }],
    usage: { prompt_tokens: 100, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 80 } },
  }, { model: 'x', provider: 'p' })
  assert.equal(r.usage.cacheReadTokens, 80)
  assert.equal(r.stopReason, 'end_turn')
})

test('geminiToResult: functionCall → tool_use; MAX_TOKENS', () => {
  const r = geminiToResult({
    candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'tìm giúp' },
      { functionCall: { name: 'recommend_products', args: { purpose: 'running' } } },
    ] } }],
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
  }, { model: 'gemini-2.0-flash', provider: 'gemini' })
  assert.equal(r.stopReason, 'tool_use')
  assert.equal(r.content[1].name, 'recommend_products')
  assert.deepEqual(r.content[1].input, { purpose: 'running' })
  assert.equal(r.usage.inputTokens, 7)
})

test('geminiToResult: MAX_TOKENS → max_tokens, không tool', () => {
  const r = geminiToResult({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'abc' }] } }] }, { model: 'x', provider: 'gemini' })
  assert.equal(r.stopReason, 'max_tokens')
})

// ————————————————————————————————————————————————
// capabilities
// ————————————————————————————————————————————————

test('resolveCapabilities: defaults pass-through', () => {
  const caps = resolveCapabilities('p', 'mymodel', { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false })
  assert.equal(caps.streaming, true)
  assert.equal(caps.vision, false)
})

test('resolveCapabilities: deepseek-reasoner bị chặn tool calling', () => {
  const caps = resolveCapabilities('deepseek', 'deepseek-reasoner', { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false })
  assert.equal(caps.toolCalling, false)
  assert.equal(caps.reasoning, true)
})

test('resolveCapabilities: env AI_MODEL_CAPABILITIES override theo substring', () => {
  process.env.AI_MODEL_CAPABILITIES = JSON.stringify({ 'gpt-4o-mini': { parallelToolCalls: false } })
  const caps = resolveCapabilities('openai', 'gpt-4o-mini-2024', { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: true, reasoning: false })
  assert.equal(caps.parallelToolCalls, false)
  assert.equal(caps.toolCalling, true) // không bị đụng
})

test('resolveCapabilities: env JSON hỏng không crash', () => {
  process.env.AI_MODEL_CAPABILITIES = '{not json'
  const caps = resolveCapabilities('p', 'm', { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: false, reasoning: false })
  assert.equal(caps.toolCalling, true)
})

// ————————————————————————————————————————————————
// AIError semantics
// ————————————————————————————————————————————————

test('AIError: phân loại retryable/fallbackEligible', () => {
  assert.equal(new AIError('RATE_LIMIT', 'x').retryable, true)
  assert.equal(new AIError('RATE_LIMIT', 'x').fallbackEligible, true)
  assert.equal(new AIError('BAD_REQUEST', 'x').retryable, false)
  assert.equal(new AIError('BAD_REQUEST', 'x').fallbackEligible, false) // lỗi nội dung — đổi provider không cứu
  assert.equal(new AIError('AUTH', 'x').fallbackEligible, false) // key sai fail-closed — sửa key, không đốt quota fallback
  assert.equal(new AIError('CAPABILITY', 'x').fallbackEligible, false)
})

test('AIError: custom retryable override', () => {
  assert.equal(new AIError('SERVER', 'x', { retryable: false }).retryable, false)
})
