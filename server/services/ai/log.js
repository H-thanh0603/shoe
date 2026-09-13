// Structured logging cho AI layer — quan sát được mà không lộ secret.
//
// Log 1 dòng mỗi model call (giống log_model_call của commerce-agents nhưng
// redacted + không log request/response body ở INFO — DEBUG mới log, và đã
// strip: key, authorization header, tool results có thể chứa data user).
//
// KHÔNG BAO GIỜ log: API keys, Authorization headers, nội dung prompt đầy đủ
// ở mức INFO, dữ liệu cá nhân user (email/địa chỉ) — tool results được fence
// ở runtime trước khi log DEBUG.

'use strict'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const level = () => LEVELS[(process.env.AI_LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info

const fmt = (v) => {
  if (typeof v === 'number') return String(v)
  if (v === undefined || v === null) return '-'
  return String(v)
}

function line(severity, parts, rid) {
  const tag = rid ? ` req=${rid}` : ''
  // eslint-disable-next-line no-console
  console[severity === 'debug' ? 'log' : severity](`[${severity}] ai ${parts.join(' ')}${tag}`)
}

/**
 * 1 model call xong (thành công hay lỗi).
 * @param {Object} p
 * @param {string} p.provider
 * @param {string} p.model
 * @param {number} p.latencyMs
 * @param {Object} [p.usage] — internal usage
 * @param {boolean} [p.stream]
 * @param {string} [p.agent]
 * @param {string} [p.requestId]
 */
function logCall({ provider, model, latencyMs, usage, stream, agent, requestId }) {
  if (level() > LEVELS.info) return
  const parts = [
    'call',
    `provider=${provider}`,
    `model=${fmt(model)}`,
    `latency_ms=${Math.round(latencyMs)}`,
    ...(usage ? [
      `in=${usage.inputTokens ?? 0}`,
      `cache_read=${usage.cacheReadTokens ?? 0}`,
      `out=${usage.outputTokens ?? 0}`,
    ] : []),
    ...(stream !== undefined ? [`stream=${stream}`] : []),
    ...(agent ? [`agent=${agent}`] : []),
  ]
  line('info', parts, requestId)
}

/** Lỗi model call sau khi hết retry/fallback với provider này. */
function logError({ provider, model, code, message, requestId, agent, latencyMs }) {
  if (level() > LEVELS.warn) return
  const parts = [
    'error',
    `provider=${fmt(provider)}`,
    ...(model ? [`model=${model}`] : []),
    `code=${code}`,
    `msg="${String(message).slice(0, 200).replace(/\s+/g, ' ')}"`,
    ...(agent ? [`agent=${agent}`] : []),
    ...(latencyMs !== undefined ? [`latency_ms=${Math.round(latencyMs)}`] : []),
  ]
  line('warn', parts, requestId)
}

/** Event fallback: chuyển provider. */
function logFallback({ from, to, reason, afterRetries, requestId }) {
  if (level() > LEVELS.warn) return
  line('warn', [
    'fallback',
    `provider=${from}→${to}`,
    `reason=${reason}`,
    ...(afterRetries ? [`after_retries=${afterRetries}`] : []),
  ], requestId)
}

/** Retry same-provider (trước khi fallback). */
function logRetry({ provider, attempt, max, code, requestId }) {
  if (level() > LEVELS.info) return
  line('info', ['retry', `provider=${provider}`, `attempt=${attempt}/${max}`, `code=${code}`], requestId)
}

/**
 * DEBUG: request/response đã redact. Chỉ khi AI_LOG_LEVEL=debug.
 * Redact: bỏ toàn bộ key-ish fields, cắt tool_result content.
 * Signature: logDebug(KIND_STRING, payload, requestId) — kind PHẢI là chuỗi
 * ngắn ("chat", "stream", …). Guard chống gọi nhầm logDebug(payload).
 */
function logDebug(kind, payload, requestId) {
  if (level() > LEVELS.debug) return
  // guard: gọi nhầm logDebug({provider…}) — kind là object → dịch xuống payload
  if (kind && typeof kind === 'object' && payload === undefined) {
    payload = kind
    kind = 'debug'
  }
  try {
    const kindStr = typeof kind === 'string' ? kind : 'debug'
    const redacted = JSON.stringify(redact(payload), (k, v) => (typeof v === 'string' && v.length > 2000 ? v.slice(0, 2000) + '…' : v))
    line('log', [kindStr, redacted], requestId)
  } catch { /* redact/serialize fail — không crash vì log */ }
}

function redact(obj, depth = 0) {
  if (depth > 8 || obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.slice(0, 20).map((x) => redact(x, depth + 1))
  const KEY_DENY = /(api[-_]?key|authorization|secret|token|password|cookie)/i
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (KEY_DENY.test(k)) { out[k] = '[redacted]'; continue }
    out[k] = redact(v, depth + 1)
  }
  return out
}

// ——— metrics counters (fail-open, cho /metrics) ———
const counters = {
  calls: 0, errors: 0, fallbacks: 0, retries: 0,
  byProvider: {}, // id -> {calls, errors}
  tokens: { in: 0, out: 0 },
}
function bump(counter, provider) {
  counters[counter]++
  if (provider) {
    counters.byProvider[provider] = counters.byProvider[provider] || { calls: 0, errors: 0 }
    counters.byProvider[provider][counter]++
  }
}
function metrics() {
  return { ...counters, byProvider: { ...counters.byProvider } }
}

module.exports = { logCall, logError, logFallback, logRetry, logDebug, metrics }
