// Adapter OpenAI-compatible — dùng chung cho MỌI provider theo wire format
// /v1/chat/completions (yêu cầu #7): deepseek, openrouter, tokenrouter, groq,
// together, fireworks, ollama, vllm, lmstudio…
//
// "OpenAI-compatible" KHÔNG có nghĩa identical — vendor differences xử lý qua
// factory options + per-provider env:
//   - openrouter: model dạng "vendor/model", headers HTTP-Referer/X-Title,
//     tool calling ổn định; usage có cache field riêng (x_* → chuẩn hoá).
//   - deepseek:   native endpoint api.deepseek.com, model "deepseek-chat".
//   - tokenrouter: giống openrouter về shape.
//   - self-host (ollama/vllm): base URL nội bộ, KHÔNG tốn rate limit.
//
// Adapter này KHÔNG biết provider nào đang dùng — registry truyền config.

'use strict'

const { AIError, wrapProviderError } = require('../types.js')
const {
  toolToOpenai, messagesToOpenai, toolChoiceToOpenai,
  openaiToResult, openaiUsageToInternal,
} = require('../convert.js')
const { resolveCapabilities } = require('../capabilities.js')

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 120_000

/**
 * Factory tạo adapter OpenAI-compatible.
 * @param {Object} cfg
 * @param {string} cfg.id — provider id cho registry/log
 * @param {string} cfg.displayName
 * @param {string} cfg.defaultModel
 * @param {() => string} cfg.baseUrl — KHÔNG có /v1 suffix (thêm khi gọi)
 * @param {() => string} cfg.apiKey
 * @param {() => Object} [cfg.extraHeaders] — vd openrouter HTTP-Referer
 * @param {(body: Object) => void} [cfg.tweakBody] — vendor patch trước send
 * @param {import('../types.js').ProviderCapabilities} [cfg.capabilityDefaults]
 * @param {(fetchErr: any) => void} [cfg.onNetworkError]
 */
function makeOpenaiCompatAdapter(cfg) {
  const id = cfg.id

  function model() { return cfg.defaultModel() }

  function baseV1() { return cfg.baseUrl().replace(/\/+$/, '') + '/v1' }

  async function fetchChat(body, { signal }) {
    const key = cfg.apiKey()
    if (!key && !cfg.allowNoKey) throw new AIError('AUTH', `Thiếu API key của provider "${id}"`, { provider: id, status: 401 })
    let res
    try {
      res = await fetch(`${baseV1()}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: body.stream ? 'text/event-stream' : 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...(cfg.extraHeaders?.() || {}),
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (e) {
      throw wrapProviderError(id, e)
    }
    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = j?.error?.message || j?.message || JSON.stringify(j).slice(0, 200)
      } catch { /* body không json */ }
      const err = wrapProviderError(id, new Error(detail || `${id} HTTP ${res.status}`))
      err.status = res.status
      throw err
    }
    return res
  }

  function toWire(req, { stream }) {
    const body = {
      model: model(),
      messages: [
        // system lên đầu (OpenAI convention)
        ...(req.system ? [{ role: 'system', content: require('../convert.js').systemToText(req.system) }] : []),
        ...messagesToOpenai(req.messages),
      ],
      max_tokens: req.maxTokens || 2048,
      stream,
    }
    if (req.tools?.length) {
      body.tools = req.tools.map(toolToOpenai)
      const tc = toolChoiceToOpenai(req.toolChoice)
      if (tc) body.tool_choice = tc
    }
    if (typeof req.temperature === 'number') body.temperature = req.temperature
    cfg.tweakBody?.(body)
    return body
  }

  async function generate(req) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetchChat(toWire(req, { stream: false }), { signal: ctrl.signal })
      const data = await res.json()
      const result = openaiToResult(data, { model: model(), provider: id })
      // model trả về có thể khác cfg (vd openrouter resolve alias) — giữ vendor
      result.model = data?.model || model()
      return result
    } finally {
      clearTimeout(timer)
    }
  }

  async function* stream(req) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const body = toWire(req, { stream: true })
      // usage trong stream (openrouter/deepseek trả) cần include_usage
      if (body.stream) body.stream_options = { include_usage: true }
      const res = await fetchChat(body, { signal: ctrl.signal })
      yield* parseOpenaiSse(res.body, { model: model(), provider: id })
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    id,
    displayName: cfg.displayName,
    capabilities: () => resolveCapabilities(id, model(), cfg.capabilityDefaults || {
      streaming: true,
      toolCalling: true,
      parallelToolCalls: true,
      structuredOutput: true,
      vision: false,
      reasoning: false,
    }),
    generate,
    stream,
    info: () => ({
      configured: Boolean(cfg.apiKey()) || Boolean(cfg.allowNoKey),
      model: model(),
      baseUrl: cfg.baseUrl(),
    }),
    _toWire: toWire,
  }
}

/**
 * Parse OpenAI SSE stream → internal StreamEvent (Anthropic-shaped semantics).
 * OpenAI stream chunks: choices[0].delta {content | tool_calls[].function.arguments},
 * cuối có usage (nếu stream_options.include_usage).
 *
 * Điểm cần cẩn thận: tool_calls delta đến theo index — ghép id/name/arguments
 * theo index, emit tool_input_delta khi arguments stream, và tổng hợp message
 * cuối cho runtime (runtime tự accumulate partial_json — giống StreamedRound
 * của commerce-agents).
 */
async function* parseOpenaiSse(body, { model, provider }) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const tools = new Map() // index → {id, name, args}
  let usage
  let finishReason = null
  let blockIndex = 0
  let sawAny = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          let chunk
          try { chunk = JSON.parse(payload) } catch { continue }
          sawAny = true
          if (chunk.usage) usage = openaiUsageToInternal(chunk.usage)
          const choice = chunk.choices?.[0]
          if (!choice) continue
          if (choice.finish_reason) finishReason = choice.finish_reason
          const delta = choice.delta || {}
          if (typeof delta.content === 'string' && delta.content) {
            yield { type: 'text_delta', text: delta.content, index: blockIndex }
          }
          for (const tc of delta.tool_calls || []) {
            const i = tc.index ?? 0
            if (!tools.has(i)) {
              tools.set(i, { id: tc.id || `call_${i}`, name: '', args: '' })
              blockIndex++ // tool block sau text block(s)
            }
            const agg = tools.get(i)
            if (tc.id) agg.id = tc.id
            if (tc.function?.name) agg.name = tc.function.name
            if (tc.function?.arguments) {
              agg.args += tc.function.arguments
              yield { type: 'tool_input_delta', partialJson: tc.function.arguments, toolUseId: agg.id, index: blockIndex }
            }
          }
        }
      }
    }
  } catch (e) {
    throw wrapProviderError(provider, e)
  }
  if (!sawAny) throw new AIError('SERVER', 'Stream không có data (provider treo?)', { provider, status: 502 })
  // tổng hợp thành message cuối (giống get_final_message của Anthropic SDK):
  // runtime nhận "final" qua events chuẩn hoá
  yield {
    type: 'final',
    content: [
      // text đã stream từng delta — runtime accumulate; đây chỉ tóm tắn cấu trúc
      ...[...tools.entries()].map(([i, t]) => ({ type: 'tool_use', id: t.id, name: t.name, input: safeParse(t.args) })),
    ].filter((b) => b.type === 'tool_use' || (b.type === 'text' && b.text)),
    stopReason: finishReason === 'tool_calls' ? 'tool_use' : finishReason === 'length' ? 'max_tokens' : 'end_turn',
    usage: usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    model,
  }
}

function safeParse(s) {
  if (!s) return {}
  try { const v = JSON.parse(s); return typeof v === 'object' && v ? v : { _value: v } } catch { return { _raw: s.slice(0, 500) } }
}

module.exports = { makeOpenaiCompatAdapter, parseOpenaiSse }
