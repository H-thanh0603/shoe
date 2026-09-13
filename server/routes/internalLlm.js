// Internal LLM Gateway — POST /api/v1/internal/llm/messages
//
// Mục đích: cho Python blueprint (anthropics/commerce-agents — runtime
// Messages API) chạy với MỌI provider cấu hình trong Node, KHÔNG cần
// LiteLLM proxy + KHÔNG cần Anthropic key. Interface là wire format
// Anthropic Messages (bao gồm SSE events) — nhưng đó chỉ là PROTOCOL, không
// phải coupling dịch vụ: provider thật phía sau hoàn toàn theo server/.env
// (deepseek/openrouter/gemini/mock/…).
//
// Bảo mật:
//  - Chỉ chấp nhận request có header X-Internal-LLM-Secret khớp
//    INTERNAL_LLM_SECRET (mặc định nếu không set: chỉ bind 127.0.0.1 — nhưng
//    production LUÔN phải set secret).
//  - KHÔNG mount public; route group đã giới hạn bởi middleware này.
//  - Rate-limit riêng (nặng hơn per-user: mỗi model call đốt tiền).
//
// Format chuyển: Anthropic request → internal ChatRequest → provider chain
// → SSE Anthropic events (message_start/content_block_*/message_delta/message_stop).

'use strict'

const express = require('express')
const { z } = require('zod')
const validate = require('../middleware/validate.js')
const { asyncHandler, httpError } = require('../middleware/errorHandler.js')
const { aiStream, aiActiveProvider, aiConfig, AIError } = require('../services/ai/index.js')
const registry = require('../services/ai/registry.js')
const { resolveCapabilities } = require('../services/ai/capabilities.js')

const router = express.Router()

const MAX_BODY_MB = 2
const DEFAULT_MAX_TOKENS = 4096

// ————————————————————————————————————————————————
// Auth: secret header nội bộ
// ————————————————————————————————————————————————
const SECRET = () => process.env.INTERNAL_LLM_SECRET || ''
router.use((req, res, next) => {
  const s = SECRET()
  // Chưa set secret → từ chối hẳn (fail-closed). Muốn bật: set INTERNAL_LLM_SECRET.
  if (!s) return res.status(503).json({ type: 'error', error: { type: 'configuration_error', message: 'INTERNAL_LLM_SECRET chưa cấu hình — gateway nội bộ tắt.' } })
  const provided = req.get('x-internal-llm-secret') || req.get('x-api-key')
  if (provided !== s) {
    return res.status(401).json({ type: 'error', error: { type: 'authentication_error', message: 'Sai internal secret' } })
  }
  next()
})

// ————————————————————————————————————————————————
// Request validation (Anthropic Messages shape)
// ————————————————————————————————————————————————
const wireSchema = z.object({
  model: z.string().optional(),
  max_tokens: z.number().int().positive().max(32_000).optional(),
  system: z.union([z.string(), z.array(z.any())]).optional(),
  messages: z.array(z.any()).min(1),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  temperature: z.number().optional(),
  stream: z.boolean().optional(),
  // Anthropic fields thừa sẽ bị bỏ qua: thinking, metadata, stop_sequences…
}).passthrough()

function toInternalRequest(body, requestId) {
  return {
    system: body.system,
    messages: body.messages,
    tools: (body.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.input_schema || { type: 'object', properties: {} },
    })),
    toolChoice: body.tool_choice?.type === 'auto' ? 'auto'
      : body.tool_choice?.type === 'any' || body.tool_choice?.type === 'tool' ? { type: 'tool', name: body.tool_choice.name }
      : body.tool_choice?.type === 'none' ? 'none' : 'auto',
    maxTokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    temperature: body.temperature,
    requestId,
    agentName: 'gateway',
  }
}

// ————————————————————————————————————————————————
// SSE emitter — chuẩn Anthropic event stream
// ————————————————————————————————————————————————
function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// SDK anthropic (AsyncAnthropic) POST tới <base_url> + /v1/messages — nên expose
// CẢ HAI path: /messages (gọi tay, gọn) và /v1/messages (cho SDK trỏ base_url
// thẳng vào gốc route này). Cùng handler.
router.post(['/messages', '/v1/messages'],
  validate(wireSchema),
  asyncHandler(async (req, res) => {
    const internal = toInternalRequest(req.body, req.id)
    // Anthropic semantics: stream mặc định false (chỉ stream khi client khai báo)
    const wantStream = req.body.stream === true

    // Provider không streaming → vẫn stream về phía client (đã queue) —
    // aiStream đã normalize (yield đầy đủ rồi message_stop).
    if (wantStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      try {
        yieldAnthropicStream(res, internal)
      } catch (e) {
        // mid-stream error → Anthropic-format error event rồi đóng
        sseWrite(res, 'error', anthropicError(e))
        res.end()
      }
      return
    }

    // non-stream: gom bằng generate path (aiStream có final; dùng aiChat cho gọn)
    const { aiChat } = require('../services/ai/index.js')
    try {
      const result = await aiChat(internal)
      res.json(toAnthropicMessageResponse(result, req.body.model))
    } catch (e) {
      const status = e instanceof AIError && e.code === 'AUTH' ? 401 : e instanceof AIError && e.code === 'RATE_LIMIT' ? 429 : 500
      res.status(status).json(anthropicError(e))
    }
  }))

/** Stream internal events → Anthropic SSE frames. */
async function yieldAnthropicStream(res, internal) {
  let msgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  let blockIndex = -1
  let currentTool = null // {id, name, buffer}
  let usage = { inputTokens: 0, outputTokens: 0 }
  let stopReason = null
  let finalBlocks = []

  const ensureTextBlock = () => {
    if (blockIndex < 0 || finalBlocks[blockIndex]?.type !== 'text') {
      blockIndex++
      finalBlocks[blockIndex] = { type: 'text', text: '' }
      sseWrite(res, 'content_block_start', {
        type: 'content_block_start', index: blockIndex,
        content_block: { type: 'text', text: '' },
      })
    }
  }
  const closeBlock = () => {
    if (blockIndex >= 0) sseWrite(res, 'content_block_stop', { type: 'content_block_stop', index: blockIndex })
  }

  sseWrite(res, 'message_start', {
    type: 'message_start',
    message: {
      id: msgId, type: 'message', role: 'assistant', model: '', content: [],
      stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  })

  for (;;) {
    const gen = aiStream(internal)
    let done = false
    let breakOuter = false
    while (!done) {
      const r = await gen.next()
      if (r.done) { done = true; break }
      const ev = r.value
      if (ev.type === 'text_delta') {
        ensureTextBlock()
        finalBlocks[blockIndex].text += ev.text
        sseWrite(res, 'content_block_delta', {
          type: 'content_block_delta', index: blockIndex,
          delta: { type: 'text_delta', text: ev.text },
        })
      } else if (ev.type === 'tool_input_delta') {
        if (!currentTool || currentTool.id !== ev.toolUseId) {
          closeBlock()
          blockIndex++
          currentTool = { id: ev.toolUseId, name: null, buffer: '' }
          finalBlocks[blockIndex] = { type: 'tool_use', id: ev.toolUseId, name: '', input: {} }
          sseWrite(res, 'content_block_start', {
            type: 'content_block_start', index: blockIndex,
            content_block: { type: 'tool_use', id: currentTool.id, name: '', input: {} },
          })
        }
        currentTool.buffer += ev.partialJson || ''
        sseWrite(res, 'content_block_delta', {
          type: 'content_block_delta', index: blockIndex,
          delta: { type: 'input_json_delta', partial_json: ev.partialJson || '' },
        })
      } else if (ev.type === 'final') {
        if (ev.usage) usage = ev.usage
        stopReason = ev.stopReason || stopReason
        if (Array.isArray(ev.content) && ev.content.length) {
          // final là authority — nhưng ta đã stream blocks; chỉ cần lấy tool
          // inputs đã parse + usage + names. Re-emit tool_use start nếu chưa.
          for (const b of ev.content) {
            if (b.type === 'tool_use') {
              if (!currentTool || currentTool.id !== b.id) {
                closeBlock()
                blockIndex++
                sseWrite(res, 'content_block_start', {
                  type: 'content_block_start', index: blockIndex,
                  content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} },
                })
                currentTool = { id: b.id, name: b.name, buffer: JSON.stringify(b.input || {}) }
              }
              currentTool.name = b.name || currentTool.name
            }
          }
        }
      } else if (ev.type === 'message_stop') {
        breakOuter = true
        break
      }
    }
    if (breakOuter || done) break
  }

  closeBlock()
  sseWrite(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: mapStopReason(stopReason), stop_sequence: null },
    usage: {
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      ...(usage.cacheReadTokens ? { cache_read_input_tokens: usage.cacheReadTokens } : {}),
    },
  })
  sseWrite(res, 'message_stop', { type: 'message_stop' })
  res.end()
}

function mapStopReason(r) {
  if (r === 'tool_use') return 'tool_use'
  if (r === 'max_tokens') return 'max_tokens'
  return 'end_turn'
}

function toAnthropicMessageResponse(result, requestedModel) {
  return {
    id: `msg_${Math.random().toString(36).slice(2, 14)}`,
    type: 'message',
    role: 'assistant',
    model: result.model || requestedModel || '',
    content: result.content,
    stop_reason: result.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: result.usage.inputTokens || 0,
      output_tokens: result.usage.outputTokens || 0,
    },
  }
}

function anthropicError(e) {
  const type = e instanceof AIError && e.code === 'AUTH' ? 'authentication_error'
    : e instanceof AIError && e.code === 'RATE_LIMIT' ? 'rate_limit_error'
    : e instanceof AIError && e.code === 'BAD_REQUEST' ? 'invalid_request_error'
    : 'api_error'
  return { type: 'error', error: { type, message: e?.message || 'Lỗi gateway nội bộ' } }
}

// ————————————————————————————————————————————————
// GET /api/v1/internal/llm/info — debug config (không key) cho bridge docs
// ————————————————————————————————————————————————
router.get('/info', (req, res) => {
  res.json({
    active: aiActiveProvider(),
    config: aiConfig(),
    note: 'Gateway dịch Anthropic Messages format → provider chain. Không lưu state.',
  })
})

module.exports = router
