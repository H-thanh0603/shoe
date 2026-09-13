// Shopping Assistant routes — POST /api/v1/assistant/chat[.stream]
//
// Public (guest được dùng — giống AWI tool layer): assistant dùng tool readOnly
// + add_to_cart human-in-the-loop. Không cần auth; rate-limit theo IP + theo
// session (chống burn tiền). Frontend nói chuyện endpoint này — KHÔNG bao giờ
// chạm provider trực tiếp (yêu cầu #5: keys server-side only).
//
// Events SSE (chuẩn hoá, không lộ provider):
//   {kind:'text', payload}            — text delta
//   {kind:'tool', payload:{name,label}}
//   {kind:'tool_result', payload:{tool,summary,status}}
//   {kind:'turn_complete', payload:{rounds, elapsedMs}}
//   {kind:'error', payload:{message}}

'use strict'

const express = require('express')
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const validate = require('../middleware/validate.js')
const { asyncHandler, httpError } = require('../middleware/errorHandler.js')
const { z } = require('zod')
const agent = require('../services/agent/index.js')

const router = express.Router()

// 20 turn / 10 phút / IP — mỗi turn có thể nhiều model call (đốt tiền thật).
// (same pattern authLimiter/agentLimiter đã có trong project)
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.AI_ASSISTANT_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `assistant:${ipKeyGenerator(req.ip)}`,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Chat quá nhanh — nghỉ chút rồi thử lại sau 10 phút' } },
})
router.use(chatLimiter)

const chatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  sessionId: z.string().trim().min(8).max(100),
})

// ————————————————————————————————————————————————
// POST /api/v1/assistant/chat/stream — SSE (frontend chính)
// ————————————————————————————————————————————————
router.post('/chat/stream',
  validate(chatBody),
  async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const sse = (kind, payload) => res.write(`data: ${JSON.stringify({ kind, payload })}\n\n`)
    try {
      for await (const ev of agent.runTurn({
        sessionId: req.body.sessionId,
        userMessage: req.body.message,
        agentName: 'shopping',
        agentId: `assistant:${ipKeyGenerator(req.ip)}`,
        requestId: req.id,
        req,
      })) {
        if (ev.type === 'text') sse('text', ev.text)
        else if (ev.type === 'tool') sse('tool', { name: ev.name, label: ev.label })
        else if (ev.type === 'tool_result') sse('tool_result', { tool: ev.tool, summary: ev.summary, status: ev.status })
        else if (ev.type === 'plan') sse('plan', { steps: ev.steps })
        else if (ev.type === 'step_done') sse('step_done', { label: ev.label })
        else if (ev.type === 'turn_complete') sse('turn_complete', { rounds: ev.rounds, elapsedMs: ev.elapsedMs })
        else if (ev.type === 'error') sse('error', { message: ev.message })
      }
    } catch (e) {
      sse('error', { message: 'Lỗi hệ thống — thử lại.' })
    }
    res.end()
  })

// ————————————————————————————————————————————————
// POST /api/v1/assistant/chat — JSON (fallback cho client không stream)
// ————————————————————————————————————————————————
router.post('/chat',
  validate(chatBody),
  asyncHandler(async (req, res) => {
    let text = ''
    const tools = []
    for await (const ev of agent.runTurn({
      sessionId: req.body.sessionId,
      userMessage: req.body.message,
      agentName: 'shopping',
      agentId: `assistant:${ipKeyGenerator(req.ip)}`,
      requestId: req.id,
      req,
    })) {
      if (ev.type === 'text') text += ev.text
      else if (ev.type === 'tool') tools.push(ev.name)
      else if (ev.type === 'error') text += `\n\n(Lỗi: ${ev.message})`
    }
    res.json({ success: true, data: { text: text.trim(), tools } })
  }))

// ————————————————————————————————————————————————
// GET /api/v1/assistant/config — để UI biết agent bật/tắt + caps (không lộ key)
// ————————————————————————————————————————————————
router.get('/config', (_req, res) => {
  const { aiActiveProvider, aiConfig } = require('../services/ai/index.js')
  let active = null
  try { active = aiActiveProvider() } catch { active = 'none' }
  let caps = null
  try { caps = aiConfig().chain[0]?.capabilities ?? null } catch { /* none */ }
  res.json({
    success: true,
    data: {
      enabled: active !== 'none',
      provider: active === 'mock' ? 'demo' : 'live', // không lộ tên provider thật
      capabilities: caps ? {
        toolCalling: caps.toolCalling,
        streaming: caps.streaming,
      } : null,
      disclaimer: active === 'mock'
        ? 'Chế độ demo: chưa cấu hình AI provider — trả lời cố định. Xem docs/AI_PROVIDERS.md.'
        : null,
    },
  })
})

module.exports = router
