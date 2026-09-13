// Adapter Google Gemini native — generativelanguage.googleapis.com.
//
// Gemini có API riêng (generateContent + functionDeclarations), tool schema
// khác (không $schema/additionalProperties). Dùng adapter riêng thay vì ép
// vào OpenAI-compat (yêu cầu #7: differences qua adapters).
//
// Env: GOOGLE_API_KEY (hoặc GEMINI_API_KEY), AI_MODEL (hoặc GEMINI_MODEL),
// GEMINI_BASE_URL (optional, vd self-host proxy).

'use strict'

const { AIError, wrapProviderError } = require('../types.js')
const { toolToGemini, systemToText } = require('../convert.js')
const { resolveCapabilities } = require('../capabilities.js')

const ID = 'gemini'
const DEFAULT_MODEL = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-2.0-flash'
const BASE_URL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 120_000

function apiKey() { return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '' }

function toWire(req) {
  const body = {
    contents: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content),
    })),
    generationConfig: {
      maxOutputTokens: req.maxTokens || 2048,
      ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
    },
  }
  const sys = systemToText(req.system)
  if (sys) body.systemInstruction = { parts: [{ text: sys }] }
  if (req.tools?.length) {
    body.tools = [{ functionDeclarations: req.tools.map(toolToGemini) }]
    const mode = req.toolChoice === 'none' ? 'NONE' : 'AUTO'
    body.toolConfig = { functionCallingConfig: { mode } }
    if (req.toolChoice?.type === 'tool') {
      body.toolConfig.functionCallingConfig = { mode: 'ANY', allowedFunctionNames: [req.toolChoice.name] }
    }
  }
  return body
}

/** Anthropic content blocks → Gemini parts (text | functionResponse) */
function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }]
  const parts = []
  for (const b of content || []) {
    if (b.type === 'text') parts.push({ text: b.text })
    else if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input || {} } })
    else if (b.type === 'tool_result') {
      parts.push({
        functionResponse: {
          name: b.name || 'tool',
          response: typeof b.content === 'string' ? { result: b.content } : (b.content || {}),
        },
      })
    }
    // thinking: bỏ
  }
  return parts.length ? parts : [{ text: '' }]
}

async function callApi(req, { stream }) {
  const key = apiKey()
  if (!key) throw new AIError('AUTH', 'Thiếu GOOGLE_API_KEY/GEMINI_API_KEY', { provider: ID, status: 401 })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const pathname = stream
    ? `/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`
    : `/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(key)}`
  try {
    let res
    try {
      res = await fetch(`${BASE_URL}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: stream ? 'text/event-stream' : 'application/json' },
        body: JSON.stringify(toWire(req)),
        signal: ctrl.signal,
      })
    } catch (e) {
      throw wrapProviderError(ID, e)
    }
    if (!res.ok) {
      let detail = ''
      try { const j = await res.json(); detail = j?.error?.message || '' } catch { /* non-json */ }
      const err = wrapProviderError(ID, new Error(detail || `Gemini HTTP ${res.status}`))
      err.status = res.status
      throw err
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

const { geminiToResult } = require('../convert.js')

async function generate(req) {
  const res = await callApi(req, { stream: false })
  const data = await res.json()
  const result = geminiToResult(data, { model: DEFAULT_MODEL, provider: ID })
  return result
}

/**
 * Gemini SSE stream: mỗi frame là 1 JSON {candidates:[...]}.
 * Convert về internal StreamEvent; functionCall parts chỉ đến khi finish
 * (Gemini không stream arguments) → emit tool_input_delta 1 lần đầy đủ.
 */
async function* stream(req) {
  const res = await callApi(req, { stream: true })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let blockIndex = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const dataLines = frame.split('\n').filter((l) => l.startsWith('data: '))
        if (!dataLines.length) continue
        let chunk
        try { chunk = JSON.parse(dataLines.map((l) => l.slice(6)).join('\n')) } catch { continue }
        const cand = chunk.candidates?.[0]
        const parts = cand?.content?.parts || []
        let usage
        if (chunk.usageMetadata) {
          usage = {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          }
        }
        for (const p of parts) {
          if (p.text) yield { type: 'text_delta', text: p.text, index: blockIndex }
          if (p.functionCall) {
            blockIndex++
            yield {
              type: 'tool_input_delta',
              // functionCall đủ args ngay lần đầu — partialJson = full JSON
              partialJson: JSON.stringify(p.functionCall.args || {}),
              toolUseId: `call_${blockIndex}_${Math.random().toString(36).slice(2, 8)}`,
              index: blockIndex,
            }
          }
        }
        if (usage) yield { type: 'message_delta', usage, stopReason: cand?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : undefined }
      }
    }
  } catch (e) {
    throw wrapProviderError(ID, e)
  }
}

module.exports = {
  id: ID,
  displayName: 'Google Gemini (native)',
  capabilities: () => resolveCapabilities(ID, DEFAULT_MODEL, {
    streaming: true,
    toolCalling: true,
    parallelToolCalls: true, // Gemini trả nhiều functionCall parts
    structuredOutput: true,
    vision: true,
    reasoning: false,
  }),
  generate,
  stream,
  info: () => ({
    configured: Boolean(apiKey()),
    model: DEFAULT_MODEL,
    baseUrl: BASE_URL,
  }),
  _toWire: toWire,
}
