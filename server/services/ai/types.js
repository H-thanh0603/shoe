// AI Provider Layer — types chung (chuẩn nội bộ = Anthropic Messages format).
//
// Layer này là BỨC TƯỜNG duy nhất giữa application và LLM vendors:
//  - Agent/business logic chỉ thấy ChatRequest/ChatResult/StreamEvent.
//  - Adapter provider (anthropic.js, openai-compat.js, gemini.js, mock.js)
//    implement AIProvider và translate ra wire format của từng vendor.
//  - KHÔNG file nào ngoài services/ai/ được import SDK/endpoint của vendor.
//
// Vì sao chuẩn nội bộ là Anthropic Messages format:
//  - commerce-agents blueprint (tham chiếu kiến trúc) tiêu thụ trực tiếp
//    (stream events, content blocks, tool_use/tool_result) → bridge Python
//    chạy qua internal gateway không cần convert thêm lần nào.
//  - Content-block cho phép stream tool input (input_json_delta) — richer
//    hơn plain string của OpenAI wire.

'use strict'

// ————————————————————————————————————————————————
// Messages
// ————————————————————————————————————————————————

/**
 * Content block chuẩn nội bộ (mirror Anthropic content blocks):
 *  { type: 'text', text }
 *  { type: 'tool_use', id, name, input }
 *  { type: 'tool_result', tool_use_id, content, is_error }
 *  { type: 'thinking', thinking, signature? }   // reasoning models
 * @typedef {Object} ContentBlock
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'} role
 * @property {string|ContentBlock[]} content
 */

/**
 * @typedef {Object} ToolSpec — provider-agnostic tool definition
 * @property {string} name
 * @property {string} description
 * @property {Object} inputSchema — JSON Schema (chuẩn JSON, không vendor)
 * @property {boolean} [readOnly]
 */

/**
 * Request một model call. Adapter tự điền model thật (theo config env).
 * @typedef {Object} ChatRequest
 * @property {string|{type:'text',text:string,cache_control?:Object}[]} [system]
 * @property {ChatMessage[]} messages
 * @property {ToolSpec[]} [tools]
 * @property {'auto'|'none'|{type:'tool',name:string}} [toolChoice]
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 * @property {string} [requestId]  — observability correlation
 * @property {string} [agentName]  — 'shopping' | 'merchant' | … (log attribution)
 * @property {boolean} [stream]    — hint; client.js quyết định cuối
 */

/**
 * @typedef {Object} Usage
 * @property {number} [inputTokens]
 * @property {number} [outputTokens]
 * @property {number} [cacheReadTokens]
 * @property {number} [cacheWriteTokens]
 */

/**
 * @typedef {Object} ChatResult
 * @property {ContentBlock[]} content — assistant blocks (text/tool_use/thinking)
 * @property {'end_turn'|'tool_use'|'max_tokens'|'stop_sequence'|null} stopReason
 * @property {Usage} usage
 * @property {string} model       — model thật đã gọi (resolved)
 * @property {string} provider    — provider đã gọi (nếu fallback, provider cuối)
 */

// ————————————————————————————————————————————————
// Streaming — chuẩn hoá từ Anthropic SSE về internal StreamEvent
// ————————————————————————————————————————————————

/**
 * @typedef {Object} StreamEvent — vendor-neutral
 * @property {'text_delta'|'tool_input_delta'|'message_start'|'message_delta'|'message_stop'} type
 * @property {string} [text]         — text_delta
 * @property {string} [partialJson]  — tool_input_delta
 * @property {string} [toolUseId]    — tool_input_delta
 * @property {number} [index]        — block index (đồng bộ content array)
 * @property {Usage} [usage]         — message_start/delta
 * @property {string} [stopReason]  — message_delta
 */

// ————————————————————————————————————————————————
// Provider interface + capabilities
// ————————————————————————————————————————————————

/**
 * Khả năng của 1 (provider, model). Thiếu capability nào → client.js/runtime
 * degrade gracefully (không crash):
 * @typedef {Object} ProviderCapabilities
 * @property {boolean} streaming
 * @property {boolean} toolCalling
 * @property {boolean} parallelToolCalls
 * @property {boolean} structuredOutput — json_schema response_format
 * @property {boolean} vision
 * @property {boolean} reasoning
 */

/**
 * @typedef {Object} AIProvider — MỖI adapter implement đúng contract này
 * @property {string} id                       — 'anthropic' | 'openai-compat' | 'gemini' | 'mock' | …
 * @property {string} displayName
 * @property {() => ProviderCapabilities} capabilities
 * @property {(req: ChatRequest) => Promise<ChatResult>} generate  — non-stream call
 * @property {(req: ChatRequest) => AsyncIterable<StreamEvent>} stream — SSE call
 * @property {() => {configured: boolean, model: string, baseUrl?: string}} info — KHÔNG bao giờ chứa key
 */

// ————————————————————————————————————————————————
// Errors — phân loại để client.js quyết định retry/fallback
// ————————————————————————————————————————————————

/** @typedef {'AUTH'|'RATE_LIMIT'|'TIMEOUT'|'SERVER'|'NETWORK'|'MODEL_NOT_FOUND'|'OVERLOAD'|'BAD_REQUEST'|'CAPABILITY'|'NO_PROVIDER'} AIErrorCode */

/**
 * Error chuẩn của AI layer. `retryable` quyết định retry same-provider;
 * `fallbackEligible` quyết định chuyển provider (lỗi nội dung như BAD_REQUEST
 * do prompt quá dài thì fallback cũng chết → ineligible).
 */
class AIError extends Error {
  /**
   * @param {AIErrorCode} code
   * @param {string} message
   * @param {Object} [opts]
   * @param {number} [opts.status] — HTTP status từ provider
   * @param {boolean} [opts.retryable]
   * @param {boolean} [opts.fallbackEligible]
   * @param {string} [opts.provider]
   * @param {Error} [opts.cause]
   */
  constructor(code, message, opts = {}) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.status = opts.status
    this.retryable = opts.retryable ?? defaultRetryable(code)
    this.fallbackEligible = opts.fallbackEligible ?? defaultFallbackEligible(code)
    this.provider = opts.provider
    this.attempts = opts.attempts || []
    if (opts.cause) this.cause = opts.cause
  }
}

function defaultRetryable(code) {
  switch (code) {
    case 'RATE_LIMIT': case 'TIMEOUT': case 'SERVER': case 'OVERLOAD': case 'NETWORK':
      return true
    default:
      return false
  }
}

function defaultFallbackEligible(code) {
  switch (code) {
    case 'AUTH': case 'RATE_LIMIT': case 'TIMEOUT': case 'SERVER': case 'OVERLOAD':
    case 'NETWORK': case 'MODEL_NOT_FOUND': case 'NO_PROVIDER':
      return true
    default: // BAD_REQUEST / CAPABILITY — lỗi của nội dung, đổi provider không救
      return false
  }
}

module.exports = {
  AIError,
  // helper cho adapter: gói error lạ (fetch throw, JSON parse fail…) thành AIError
  wrapProviderError(provider, err, { timeoutMs } = {}) {
    if (err instanceof AIError) return err
    const msg = err?.message || String(err)
    const aborted = err?.name === 'AbortError' || /abort/i.test(msg)
    if (aborted) return new AIError('TIMEOUT', 'Hết thời gian chờ model', { provider, status: 408, cause: err })
    const status = typeof err?.status === 'number' ? err.status
      : typeof err?.statusCode === 'number' ? err.statusCode : undefined
    if (status === 429) return new AIError('RATE_LIMIT', msg, { provider, status, cause: err })
    if (status === 401 || status === 403) return new AIError('AUTH', 'API key không hợp lệ hoặc thiếu quyền', { provider, status, cause: err })
    if (status === 404) return new AIError('MODEL_NOT_FOUND', msg, { provider, status, cause: err })
    if (status === 400 || status === 422) return new AIError('BAD_REQUEST', msg, { provider, status, cause: err })
    if (status >= 500) return new AIError('SERVER', msg, { provider, status, cause: err })
    if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'EAI_AGAIN') {
      return new AIError('NETWORK', msg, { provider, status: 503, cause: err })
    }
    if (timeoutMs && /timeout|timed out/i.test(msg)) return new AIError('TIMEOUT', msg, { provider, status: 408, cause: err })
    return new AIError('SERVER', msg, { provider, status: 502, cause: err })
  },
}
