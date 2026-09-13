// AI client — điểm gọi duy nhất cho agent runtime.
//
// aiChat/aiStream phân giải provider chain → retry same-provider (429/5xx/
// network/timeout, backoff + Retry-After) → fallback provider kế tiếp (lỗi
// không phải nội dung) → mock chót (degraded mode thay vì crash app).
//
// Agent runtime KHÔNG BAO GIỜ import adapter trực tiếp — chỉ dùng client này.

'use strict'

const { AIError } = require('./types.js')
const registry = require('./registry.js')
const log = require('./log.js')

const MAX_RETRIES = Math.max(0, Number(process.env.AI_MAX_RETRIES ?? 2))
const RETRY_BASE_MS = Number(process.env.AI_RETRY_BASE_MS) || 800
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 120_000

/**
 * Chuẩn hoá request: strip cache_control markers (Anthropic-only), force
 * toolChoice none khi provider không có toolCalling (degrade gracefully).
 */
function adaptRequest(req, adapter) {
  const caps = adapter.capabilities()
  const out = { ...req }
  if (!caps.toolCalling) {
    // provider không tool-calling: bỏ tools. Nếu caller bắt buộc tools →
    // tùy cấu hình: fail rõ ràng hoặc chạy text-only.
    if (req.tools?.length && process.env.AI_REQUIRE_TOOLS !== 'false') {
      throw new AIError('CAPABILITY', `Provider "${adapter.id}" không hỗ trợ tool calling — cấu hình AI_REQUIRE_TOOLS=false để chạy text-only hoặc đổi provider`, { provider: adapter.id })
    }
    out.tools = undefined
    out.toolChoice = undefined
  }
  if (!caps.parallelToolCalls) {
    // runtime tự tuần tự hoá; client chỉ note qua request flag
    out._serialToolCalls = true
  }
  return out
}

/** Retryable theo AIError + có Retry-After header không (đi qua err.status). */
function backoffMs(attempt, err) {
  const ra = err?.retryAfterMs
  if (typeof ra === 'number') return Math.min(ra, 30_000)
  const jitter = Math.random() * 0.3 + 0.85
  return Math.min(RETRY_BASE_MS * 2 ** attempt * jitter, 20_000)
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new AIError('TIMEOUT', 'Aborted', { status: 408 })) }, { once: true })
  })
}

/**
 * Non-stream call với retry + fallback.
 * @param {import('./types.js').ChatRequest} req
 * @param {Object} [opts] — {onEvent} cho observability
 * @returns {Promise<import('./types.js').ChatResult>}
 */
async function aiChat(req, opts = {}) {
  const chain = registry.fallbackChain()
  const attempts = []
  for (let pi = 0; pi < chain.length; pi++) {
    const adapter = chain[pi]
    const started = Date.now()
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let err
      try {
        const adapted = adaptRequest(req, adapter)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
        let result
        try {
          result = await adapter.generate(adapted, { signal: ctrl.signal })
        } finally {
          clearTimeout(timer)
        }
        log.logCall({
          provider: adapter.id, model: result.model, latencyMs: Date.now() - started,
          usage: result.usage, stream: false, agent: req.agentName, requestId: req.requestId,
        })
        bumpMetrics('calls', adapter.id, result.usage)
        return { ...result, attempts }
      } catch (e) {
        err = e instanceof AIError ? e : new AIError('SERVER', e?.message || String(e), { provider: adapter.id, cause: e })
        err.provider = adapter.id
        attempts.push({ provider: adapter.id, code: err.code, attempt })
      }
      // quyết định retry/fallback
      const canRetry = err.retryable && attempt < MAX_RETRIES
      if (canRetry) {
        logRetry({ provider: adapter.id, attempt: attempt + 1, max: MAX_RETRIES, code: err.code, requestId: req.requestId })
        _counters.retries++
        await sleep(backoffMs(attempt, err))
        continue
      }
      if (err.fallbackEligible && pi < chain.length - 1) {
        logFallback({ from: adapter.id, to: chain[pi + 1].id, reason: err.code, afterRetries: attempt, requestId: req.requestId })
        _counters.fallbacks++
        break // sang provider kế
      }
      logErrorMetrics(adapter.id)
      log.logError({ provider: adapter.id, model: adapter.info().model, code: err.code, message: err.message, requestId: req.requestId, agent: req.agentName, latencyMs: Date.now() - started })
      err.attempts = attempts
      throw err
    }
  }
  throw new AIError('NO_PROVIDER', 'Không provider nào trong chain đáp ứng', { attempts })
}

// ——— metrics helpers (log.js giữ counters, tránh circular) ———
function logRetry(p) { log.logRetry(p) }
function logFallback(p) { log.logFallback(p) }
function logErrorMetrics(provider) { /* counters qua log.metrics() */ }

// log.js không export bump trực tiếp — dùng module-level map rồi merge vào
// log.metrics() output qua /metrics route (server.js). Đơn giản hoá: giữ ở đây.
const _counters = { calls: 0, errors: 0, fallbacks: 0, retries: 0, tokensIn: 0, tokensOut: 0, byProvider: {} }
function bumpMetrics(kind, provider, usage) {
  _counters[kind]++
  if (kind === 'calls') {
    _counters.tokensIn += usage?.inputTokens || 0
    _counters.tokensOut += usage?.outputTokens || 0
    _counters.retries = _counters.retries // giữ
  }
  if (provider) {
    _counters.byProvider[provider] = _counters.byProvider[provider] || { calls: 0, errors: 0, fallbacks: 0 }
    _counters.byProvider[provider][kind]++
  }
}
function metricsSnapshot() {
  return { ..._counters, byProvider: JSON.parse(JSON.stringify(_counters.byProvider)) }
}

/**
 * Stream call với retry + fallback. QUAN TRỌNG: chỉ retry/fallback TRƯỚC khi
 * event đầu tiên được yield ra ngoài (user chưa thấy gì) — sau đó provider
 * swap giữa chừng sẽ tái tạo text đã stream (yêu cầu #11: tránh loop + UX lạ).
 *
 * @param {import('./types.js').ChatRequest} req
 * @yields {import('./types.js').StreamEvent}
 */
async function* aiStream(req) {
  const chain = registry.fallbackChain()
  const attempts = []
  for (let pi = 0; pi < chain.length; pi++) {
    const adapter = chain[pi]
    const caps = adapter.capabilities()
    let adapted
    try {
      adapted = adaptRequest(req, adapter)
    } catch (e) {
      if (e.code === 'CAPABILITY') { logFallback({ from: adapter.id, to: chain[pi + 1]?.id || 'none', reason: 'capability', requestId: req.requestId }); continue }
      throw e
    }
    const started = Date.now()
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let stream = null
      let err = null
      let yielded = false
      try {
        // capability streaming=false → dùng generate + queue (graceful degrade)
        if (!caps.streaming) {
          const result = await adapter.generate(adapted)
          for (const b of result.content) {
            if (b.type === 'text') {
              for (const piece of b.text.match(/.{1,24}/gs) || []) {
                yield { type: 'text_delta', text: piece, index: 0 }
                yielded = true
              }
            } else if (b.type === 'tool_use') {
              yield { type: 'tool_input_delta', partialJson: JSON.stringify(b.input), toolUseId: b.id, index: 1 }
              yielded = true
            }
          }
          yield { type: 'final', content: result.content, stopReason: result.stopReason, usage: result.usage, model: result.model }
          yield { type: 'message_stop' }
          logComplete(adapter, result, started, req, attempts)
          return
        }
        stream = adapter.stream(adapted)
        let first = true
        for (;;) {
          const { done, value } = await stream.next()
          if (done) break
          if (first && value.type === 'message_start') { first = false; continue } // swallow để retry window đóng sau event thật
          if (first && (value.type === 'text_delta' || value.type === 'tool_input_delta')) {
            first = false
            yielded = true
          }
          yield value
          if (value.type === 'final') {
            logComplete(adapter, value, started, req, attempts)
            return
          }
          if (value.type === 'message_stop') return
        }
        // stream kết thúc không có final (mock/adapter lạ) — bọc result rỗng
        yield { type: 'final', content: [], stopReason: 'end_turn', usage: {}, model: adapter.info().model }
        return
      } catch (e) {
        err = e instanceof AIError ? e : new AIError('SERVER', e?.message || String(e), { provider: adapter.id, cause: e })
        err.provider = adapter.id
        attempts.push({ provider: adapter.id, code: err.code, attempt })
        // đã yield text ra ngoài → KHÔNG retry/fallback (user đã thấy một nửa)
        if (yielded) {
          logErrorMetrics(adapter.id)
          log.logError({ provider: adapter.id, model: adapter.info().model, code: err.code, message: err.message, requestId: req.requestId, agent: req.agentName })
          err.attempts = attempts
          throw err
        }
      }
      const canRetry = err.retryable && attempt < MAX_RETRIES
      if (canRetry) {
        logRetry({ provider: adapter.id, attempt: attempt + 1, max: MAX_RETRIES, code: err.code, requestId: req.requestId })
        _counters.retries++
        await sleep(backoffMs(attempt, err))
        continue
      }
      if (err.fallbackEligible && pi < chain.length - 1) {
        logFallback({ from: adapter.id, to: chain[pi + 1].id, reason: err.code, afterRetries: attempt, requestId: req.requestId })
        _counters.fallbacks++
        break
      }
      logErrorMetrics(adapter.id)
      log.logError({ provider: adapter.id, model: adapter.info().model, code: err.code, message: err.message, requestId: req.requestId, agent: req.agentName })
      err.attempts = attempts
      throw err
    }
  }
  throw new AIError('NO_PROVIDER', 'Không provider nào trong chain đáp ứng', { attempts })
}

function logComplete(adapter, resultOrFinal, started, req, attempts) {
  log.logCall({
    provider: adapter.id,
    model: resultOrFinal.model || adapter.info().model,
    latencyMs: Date.now() - started,
    usage: resultOrFinal.usage,
    stream: true,
    agent: req.agentName,
    requestId: req.requestId,
  })
  bumpMetrics('calls', adapter.id, resultOrFinal.usage)
}

module.exports = { aiChat, aiStream, metricsSnapshot, _counters }
