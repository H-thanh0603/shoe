// POST /api/v1/agent/chat — proxy xác thực tới Python bridge (loopback).
// Merchant chat yêu cầu admin; session_id do client tạo (1 tab = 1 phiên).
// v1: non-streaming (bridge gom text_delta). Timeout 120s vì turn gọi nhiều tools.
const express = require('express')
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const { requireAuth, loadPerms, requirePerm } = require('../middleware/auth.js')
const validate = require('../middleware/validate.js')
const { asyncHandler, httpError } = require('../middleware/errorHandler.js')
const { z } = require('zod')

const router = express.Router()

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:4001'
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || ''

// Mỗi turn đốt tiền LLM + DB — giới hạn theo admin user (không theo IP vì
// cùng mạng nội bộ): 30 turn/10 phút. Vượt → 429, UI báo thử lại sau.
const agentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent:${req.user?.id ?? ipKeyGenerator(req.ip)}`,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Bạn chat agent quá nhanh — thử lại sau 10 phút' } },
})
router.use(agentLimiter)

router.post('/chat',
  requireAuth, loadPerms, requirePerm('agent:use'),
  validate(z.object({
    message: z.string().trim().min(1).max(2000),
    sessionId: z.string().trim().min(1).max(100),
  })),
  asyncHandler(async (req, res) => {
    if (!BRIDGE_SECRET) throw httpError(503, 'BRIDGE_NOT_CONFIGURED', 'Chưa cấu hình BRIDGE_SECRET')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 120_000)
    let r
    try {
      r = await fetch(`${BRIDGE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': BRIDGE_SECRET },
        body: JSON.stringify({
          role: 'merchant',
          session_id: req.body.sessionId,
          operator: `admin:${req.user.id}`,
          message: req.body.message,
        }),
        signal: ctrl.signal,
      })
    } catch (e) {
      if (e.name === 'AbortError') throw httpError(504, 'AGENT_TIMEOUT', 'Agent suy nghĩ quá lâu — thử câu ngắn hơn')
      throw httpError(503, 'BRIDGE_DOWN', 'Bridge agent chưa chạy (agents/run_bridge.sh)')
    } finally {
      clearTimeout(timer)
    }
    if (r.status === 403) throw httpError(500, 'BRIDGE_SECRET_MISMATCH', 'Sai BRIDGE_SECRET giữa server và bridge')
    const body = await r.json().catch(() => null)
    if (!r.ok) throw httpError(502, 'BRIDGE_ERROR', body?.detail || `Bridge lỗi HTTP ${r.status}`)
    res.json({ success: true, data: body })
  }),
)

// POST /api/v1/agent/chat/stream — SSE pipe từ bridge (text live từng token)
// Client đọc bằng fetch + ReadableStream (EventSource không POST được).
router.post('/chat/stream',
  requireAuth, loadPerms, requirePerm('agent:use'),
  validate(z.object({
    message: z.string().trim().min(1).max(2000),
    sessionId: z.string().trim().min(1).max(100),
  })),
  asyncHandler(async (req, res) => {
    if (!BRIDGE_SECRET) throw httpError(503, 'BRIDGE_NOT_CONFIGURED', 'Chưa cấu hình BRIDGE_SECRET')
    let r
    try {
      r = await fetch(`${BRIDGE_URL}/chat_stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': BRIDGE_SECRET },
        body: JSON.stringify({
          role: 'merchant',
          session_id: req.body.sessionId,
          operator: `admin:${req.user.id}`,
          message: req.body.message,
        }),
      })
    } catch {
      throw httpError(503, 'BRIDGE_DOWN', 'Bridge agent chưa chạy (agents/run_bridge.sh)')
    }
    if (!r.ok || !r.body) throw httpError(502, 'BRIDGE_ERROR', `Bridge lỗi HTTP ${r.status}`)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    req.on('close', () => r.body.cancel().catch(() => {}))
    try {
      for await (const chunk of r.body) res.write(chunk)
    } catch { /* client ngắt giữa chừng */ }
    res.end()
  }),
)

module.exports = router
