// Conversions giữa wire formats: Anthropic (chuẩn nội bộ) ⇄ OpenAI ⇄ Gemini.
//
// Mọi adapter OpenAI-compatible (openrouter, tokenrouter, deepseek, groq,
// ollama, vllm…) dùng chung convert này — không duplicate logic (yêu cầu #7),
// nhưng vendor differences xử lý ở options của adapter (headers, param names).
//
// Test trực thuộc: test/ai-convert.test.js — mọi hàm ở đây pure, không network.

'use strict'

// ————————————————————————————————————————————————
// Tools: JSON Schema (internal, chuẩn MCP/AWI registry) → vendor formats
// ————————————————————————————————————————————————

/** internal ToolSpec → Anthropic tool param (identity: trùng shape) */
function toolToAnthropic(tool) {
  return { name: tool.name, description: tool.description, input_schema: tool.inputSchema }
}

/** internal ToolSpec → OpenAI function tool */
function toolToOpenai(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      // OpenAI đặt parameters trong "function.parameters" — JSON Schema
      parameters: tool.inputSchema,
    },
  }
}

/** internal ToolSpec → Gemini functionDeclaration (OpenAPI-ish, không $schema, no additionalProperties object) */
function toolToGemini(tool) {
  const clean = sanitizeSchemaForGemini(tool.inputSchema)
  return {
    name: tool.name,
    description: tool.description,
    parameters: clean,
  }
}

// Gemini function parameters không chấp nhận "$schema", "additionalProperties",
// "exclusiveMinimum"… — strip đệ quy mọi vị trí (nested schemas xuất hiện cả
// trong giá trị của properties map, items, anyOf… chứ không chỉ theo key).
function sanitizeSchemaForGemini(schema) {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini)
  if (!schema || typeof schema !== 'object') return schema
  const GEMINI_FORBIDDEN = new Set(['$schema', 'additionalProperties', 'exclusiveMinimum', 'exclusiveMaximum', 'format'])
  const out = {}
  for (const [k, v] of Object.entries(schema)) {
    if (GEMINI_FORBIDDEN.has(k)) continue
    out[k] = (v && typeof v === 'object') ? sanitizeSchemaForGemini(v) : v
  }
  return out
}

// ————————————————————————————————————————————————
// Messages: Anthropic (internal) → vendor request
// ————————————————————————————————————————————————

/**
 * Chuẩn hoá system: internal (string | blocks) → string đơn.
 * Cache_control marker bị bỏ (không provider nào ngoài Anthropic hiểu).
 */
function systemToText(system) {
  if (!system) return undefined
  if (typeof system === 'string') return system
  if (Array.isArray(system)) {
    return system.map((b) => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean).join('\n\n')
  }
  return undefined
}

/** Content của 1 message (string | blocks) → string text thuần (dùng cho Gemini) */
function blocksToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b) => (b?.type === 'text' ? b.text : b?.type === 'tool_result' ? String(b.content ?? '') : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Anthropic messages → OpenAI chat messages.
 * - tool_use → assistant message có tool_calls
 * - tool_result → user message có tool role blocks (OpenAI là "role:tool")
 * - Bắt cặp: mỗi tool_result tách thành 1 message riêng theo đúng thứ tự.
 * - String content của tool_result được giữ nguyên; block list của tool_result
 *   (nếu có) được join text.
 */
function messagesToOpenai(messages) {
  const out = []
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    const content = msg.content
    if (typeof content === 'string') {
      out.push({ role, content })
      continue
    }
    // tách block: text + tool_use thuộc assistant; tool_result thuộc "tool"
    const textParts = []
    const toolCalls = []
    for (const b of content || []) {
      if (b.type === 'text') textParts.push(b.text)
      else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } })
      else if (b.type === 'thinking') { /* reasoning nội bộ — không gửi lại cho OpenAI */ }
      else if (b.type === 'tool_result') {
        // tool_result phải theo sau message assistant có tool_call tương ứng.
        // Đảm bảo có message assistant "chứa" trước: nếu out cuối không phải
        // assistant có tool_calls → tạo placeholder rỗng (không xảy ra với
        // turn-loop chuẩn, nhưng chống vỡ request với history lạ).
        const last = out[out.length - 1]
        if (!last || last.role !== 'assistant' || !Array.isArray(last.tool_calls)) {
          out.push({ role: 'assistant', content: textParts.join('') || null, tool_calls: toolCalls.length ? toolCalls : undefined })
        }
        out.push({
          role: 'tool',
          tool_call_id: b.tool_use_id,
          content: toolResultToText(b),
        })
        continue
      }
    }
    out.push({
      role,
      content: textParts.join('') || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    })
  }
  // dọn: message assistant rỗng hoàn toàn (content null, không tool_calls) → bỏ
  return out.filter((m) => m.content !== null || (Array.isArray(m.tool_calls) && m.tool_calls.length))
}

function toolResultToText(b) {
  const c = b.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n')
  if (c && typeof c === 'object') return JSON.stringify(c)
  return ''
}

/** toolChoice internal → OpenAI tool_choice */
function toolChoiceToOpenai(toolChoice) {
  if (toolChoice === 'auto' || toolChoice === 'none') return toolChoice
  if (toolChoice && toolChoice.type === 'tool') return { type: 'function', function: { name: toolChoice.name } }
  return undefined
}

/** toolChoice internal → Gemini mode */
function toolChoiceToGemini(toolChoice) {
  if (toolChoice === 'auto') return 'AUTO'
  if (toolChoice === 'none') return 'NONE'
  if (toolChoice && toolChoice.type === 'tool') return 'ANY' // + allowedTools lọc ở adapter
  return undefined
}

// ————————————————————————————————————————————————
// Response: vendor → internal (Anthropic-shaped)
// ————————————————————————————————————————————————

/**
 * OpenAI chat completion response → internal ChatResult (Anthropic-shaped).
 * - message.content string → 1 text block
 * - message.tool_calls[] → tool_use blocks (id, name, input parsed)
 * - finish_reason: 'tool_calls' → 'tool_use'; 'stop' → 'end_turn';
 *   'length' → 'max_tokens'; 'content_filter' → 'end_turn' (nội dung chặn).
 */
function openaiToResult(resp, { model, provider }) {
  const choice = resp?.choices?.[0]
  const msg = choice?.message || {}
  const content = []
  const text = typeof msg.content === 'string' ? msg.content
    : Array.isArray(msg.content) ? msg.content.map((p) => p?.text || '').filter(Boolean).join('')
    : ''
  if (text) content.push({ type: 'text', text })
  for (const tc of msg.tool_calls || []) {
    let input = {}
    try { input = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {} } catch { input = { _raw: String(tc.function?.arguments || '') } }
    content.push({ type: 'tool_use', id: tc.id || `call_${Math.random().toString(36).slice(2)}`, name: tc.function?.name, input })
  }
  const finish = choice?.finish_reason
  const stopReason = finish === 'tool_calls' ? 'tool_use'
    : finish === 'length' ? 'max_tokens'
    : 'end_turn'
  const u = resp?.usage || {}
  return {
    content,
    stopReason,
    usage: {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      // OpenRouter stream có cache field dạng x_*; non-stream thường không
      cacheReadTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: 0,
    },
    model: resp?.model || model,
    provider,
  }
}

/** OpenAI usage chunk → partial internal Usage (streaming) */
function openaiUsageToInternal(u) {
  if (!u) return undefined
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    cacheReadTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  }
}

/**
 * Gemini generateContent response → internal ChatResult.
 * - candidates[0].content.parts: textPart → text block; functionCall → tool_use
 * - finishReason: 'STOP' → end_turn; 'MAX_TOKENS' → max_tokens; 'functionCall' kiểm qua parts
 */
function geminiToResult(resp, { model, provider }) {
  const cand = resp?.candidates?.[0]
  const parts = cand?.content?.parts || []
  const content = []
  for (const p of parts) {
    if (typeof p?.text === 'string' && p.text) content.push({ type: 'text', text: p.text })
    if (p?.functionCall) content.push({ type: 'tool_use', id: `call_${Math.random().toString(36).slice(2, 10)}`, name: p.functionCall.name, input: p.functionCall.args || {} })
  }
  const hasTool = content.some((b) => b.type === 'tool_use')
  const stopReason = cand?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : (hasTool ? 'tool_use' : 'end_turn')
  const u = resp?.usageMetadata || {}
  return {
    content,
    stopReason,
    usage: {
      inputTokens: u.promptTokenCount ?? 0,
      outputTokens: u.candidatesTokenCount ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    model: resp?.modelVersion || model,
    provider,
  }
}

/** Anthropic non-stream response (từ API thật hoặc gateway) → internal ChatResult (identity) */
function anthropicToResult(resp, { provider }) {
  return {
    content: (resp?.content || []).map((b) => ({ ...b })),
    stopReason: resp?.stop_reason ?? null,
    usage: {
      inputTokens: resp?.usage?.input_tokens ?? 0,
      outputTokens: resp?.usage?.output_tokens ?? 0,
      cacheReadTokens: resp?.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: resp?.usage?.cache_creation_input_tokens ?? 0,
    },
    model: resp?.model,
    provider,
  }
}

module.exports = {
  toolToAnthropic,
  toolToOpenai,
  toolToGemini,
  sanitizeSchemaForGemini,
  systemToText,
  blocksToText,
  messagesToOpenai,
  toolResultToText,
  toolChoiceToOpenai,
  toolChoiceToGemini,
  openaiToResult,
  openaiUsageToInternal,
  geminiToResult,
  anthropicToResult,
}
