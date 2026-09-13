// Adapter Anthropic Messages API native — api.anthropic.com/v1/messages.
//
// Là một adapter trong chuỗi provider-agnostic; KHÔNG file nào ngoài
// services/ai/ import SDK/endpoint này. HTTP trực tiếp bằng fetch (không thêm
// SDK dependency — yêu cầu #15), stream parse SSE thủ công.
//
// Env: ANTHROPIC_API_KEY, AI_MODEL (hoặc ANTHROPIC_MODEL), ANTHROPIC_BASE_URL (tùy chọn)

'use strict'

const { AIError, wrapProviderError } = require('../types.js')
const { toolToAnthropic } = require('../convert.js')
const { resolveCapabilities } = require('../capabilities.js')
const log = require('../log.js')

const ID = 'anthropic'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || 'claude-sonnet-4-5'
const BASE_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
const API_VERSION = '2023-06-01'
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 120_000

function apiKey() { return process.env.ANTHROPIC_API_KEY || '' }

// ——— request internal → wire ———
function toWire(req, { model, stream }) {
  const body = {
    model,
    max_tokens: req.maxTokens || 2048,
    messages: req.messages,
    stream,
  }
  if (req.system) body.system = req.system
  if (req.tools?.length) {
    body.tools = req.tools.map(toolToAnthropic)
    if (req.toolChoice) {
      if (req.toolChoice === 'auto' || req.toolChoice === 'none') body.tool_choice = { type: req.toolChoice }
      else if (req.toolChoice.type === 'tool') body.tool_choice = { type: 'tool', name: req.toolChoice.name }
    }
  }
  if (typeof req.temperature === 'number') body.temperature = req.temperature
  return body
}

async function fetchRaw(pathname, body, { signal }) {
  const key = apiKey()
  if (!key) throw new AIError('AUTH', 'Thiếu ANTHROPIC_API_KEY', { provider: ID, status: 401 })
  let res
  try {
    res = await fetch(`${BASE_URL}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        accept: body.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    throw wrapProviderError(ID, e)
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.error?.message || '' } catch { /* body không json */ }
    const err = wrapProviderError(ID, new Error(detail || `Anthropic HTTP ${res.status}`))
    err.status = res.status
    throw err
  }
  return res
}

// ——— AIProvider: generate ———
async function generate(req) {
  const model = DEFAULT_MODEL
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchRaw('/v1/messages', toWire(req, { model, stream: false }), { signal: ctrl.signal })
    const data = await res.json()
    return {
      content: (data.content || []).map((b) => ({ ...b })),
      stopReason: data.stop_reason ?? null,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
      },
      model: data.model || model,
      provider: ID,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ——— AIProvider: stream (SSE parse → internal StreamEvent) ———
async function* stream(req) {
  const model = DEFAULT_MODEL
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchRaw('/v1/messages', toWire(req, { model, stream: true }), { signal: ctrl.signal })
    yield* parseAnthropicSse(res.body, model)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parse SSE Anthropic → internal StreamEvent. Exported để internal gateway tái
 * sử dụng đúng semantic (gateway emit ngược lại format Anthropic từ internal).
 */
async function* parseAnthropicSse(body, model) {
  let buf = ''
  let decoder = new TextDecoder()
  const readers = body.getReader()
  try {
    for (;;) {
      const { done, value } = await readers.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const ev = parseFrame(frame)
        if (ev) yield* emitInternal(ev, model)
      }
    }
  } catch (e) {
    throw wrapProviderError(ID, e)
  }
}

function parseFrame(frame) {
  let event = null
  const dataLines = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim()
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
  }
  if (!dataLines.length) return null
  try { return { event: event || 'message', data: JSON.parse(dataLines.join('\n')) } } catch { return null }
}

function* emitInternal({ data }, model) {
  const t = data.type
  if (t === 'message_start') {
    yield { type: 'message_start', usage: usageFrom(data.message?.usage) }
  } else if (t === 'content_block_start') {
    if (data.content_block?.type === 'tool_use') {
      // tool_use block bắt đầu — forward để runtime track
      yield { type: 'tool_use_start', index: data.index, toolUseId: data.content_block.id, name: data.content_block.name }
    }
  } else if (t === 'content_block_delta') {
    if (data.delta?.type === 'text_delta') yield { type: 'text_delta', text: data.delta.text, index: data.index }
    else if (data.delta?.type === 'input_json_delta') yield { type: 'tool_input_delta', partialJson: data.delta.partial_json, toolUseId: data.tool_use_id, index: data.index }
    // thinking_delta: bỏ qua (reasoning nội bộ, không hiển thị)
  } else if (t === 'message_delta') {
    yield { type: 'message_delta', usage: usageFrom(data.usage), stopReason: data.delta?.stop_reason }
  } else if (t === 'message_stop') {
    yield { type: 'message_stop' }
  }
}

function usageFrom(u) {
  if (!u) return undefined
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  }
}

module.exports = {
  id: ID,
  displayName: 'Anthropic (native)',
  capabilities: () => resolveCapabilities(ID, DEFAULT_MODEL, {
    streaming: true,
    toolCalling: true,
    parallelToolCalls: true,
    structuredOutput: true,
    vision: true,
    reasoning: true,
  }),
  generate,
  stream,
  info: () => ({
    configured: Boolean(apiKey()),
    model: DEFAULT_MODEL,
    baseUrl: BASE_URL,
  }),
  // for tests
  _toWire: toWire,
  _parseFrame: parseFrame,
}
