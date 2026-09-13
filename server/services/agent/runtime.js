// Agent Runtime — vòng agent loop provider-agnostic (port khái niệm
// shopping-agent orchestrator của commerce-agents sang Node).
//
// Một turn:
//   system prompt + history → aiStream (provider layer) → events:
//     - text_delta    → yield ra SSE
//     - tool_use      → executeTool (Node, DB) → tool_result vào history → vòng mới
//     - end_turn      → yield turn_complete
//   Giới hạn: maxRounds (chống loop vô hạn tốn tiền).
//
// Toàn bộ model access qua services/ai (AIProvider interface). File này
// KHÔNG import bất kỳ SDK/endpoint vendor nào — đổi DeepSeek↔Anthropic↔Gemini
// không chạm dòng nào ở đây.

'use strict'

const { aiStream, AIError } = require('../ai/index.js')
const sessions = require('./sessions.js')
const { executeTool, fenceResult, publicToolSpecs, allToolSpecs } = require('./tools.js')
const { shoppingSystemPrompt } = require('./prompts.js')

// đọc env lúc gọi (không phải lúc require) — test/đổi cấu hình không cần restart
const maxRounds = () => Math.max(1, Number(process.env.AI_MAX_ROUNDS) || 8)
const DEFAULT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 2048

/**
 * Chạy 1 turn agent (async generator — yield AgentEvent cho SSE layer).
 *
 * @param {Object} p
 * @param {string} p.sessionId
 * @param {string} p.userMessage
 * @param {string} [p.agentName='shopping'] — 'shopping' | 'merchant' (chọn tool set)
 * @param {string} [p.agentId] — identity cho rate-limit + giỏ agent-side
 * @param {string} [p.requestId] — observability correlation
 * @param {Object} [p.req] — express req (cho tool ctx — CSRF/auth passthrough)
 * @yields {{type:'text'|'tool'|'tool_result'|'progress'|'turn_complete'|'error', ...}}
 */
async function* runTurn({ sessionId, userMessage, agentName = 'shopping', agentId, requestId, req }) {
  const started = Date.now()
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

  // ——— session + turn cap ———
  let session = sessions.get(sessionId) || sessions.create(sessionId)
  if (sessions.atLimit(sessionId)) {
    yield { type: 'error', message: 'Phiên chat đã quá dài — tải lại trang để bắt đầu phiên mới (gọn context, rẻ hơn).' }
    return
  }
  sessions.bumpTurn(sessionId)

  const tools = agentName === 'merchant' ? allToolSpecs() : publicToolSpecs()
  const system = shoppingSystemPrompt({ cartUrlHint: true })

  // push user message vào history
  session.messages.push({ role: 'user', content: userMessage })

  let toolUseRound = 0
  let assistantText = ''

  try {
    const rounds = maxRounds()
    for (let round = 0; round < rounds; round++) {
      toolUseRound = round
      const forceText = round === rounds - 1

      // ——— 1 model call (stream) ———
      const stream = aiStream({
        system,
        messages: session.messages,
        tools: forceText ? undefined : tools,
        toolChoice: forceText ? 'none' : 'auto',
        maxTokens: DEFAULT_MAX_TOKENS,
        agentName,
        requestId,
      })

      /** @type {Array} */ const roundBlocks = []
      /** @type {Array<{id:string,name:string,input:Object}>} */ const toolUses = []
      let stopReason = null
      let partialTool = null // đang stream input của tool nào

      for (;;) {
        const { done, value } = await stream.next()
        if (done) break
        const ev = value
        if (ev.type === 'text_delta') {
          assistantText += ev.text
          yield { type: 'text', text: ev.text }
          if (!roundBlocks.length || roundBlocks[roundBlocks.length - 1]?.type !== 'text') {
            roundBlocks.push({ type: 'text', text: ev.text })
          } else {
            roundBlocks[roundBlocks.length - 1].text += ev.text
          }
        } else if (ev.type === 'tool_input_delta') {
          // accumulate partial JSON — parse ở final (giống StreamedRound buffer)
          if (!partialTool || partialTool.id !== ev.toolUseId) {
            partialTool = { id: ev.toolUseId, name: null, buffer: ev.partialJson }
          } else {
            partialTool.buffer += ev.partialJson
          }
        } else if (ev.type === 'final') {
          // final content từ adapter (đã parse tool inputs + usage)
          stopReason = ev.stopReason
          if (ev.usage) {
            usage.inputTokens += ev.usage.inputTokens || 0
            usage.outputTokens += ev.usage.outputTokens || 0
            usage.cacheReadTokens += ev.usage.cacheReadTokens || 0
            usage.cacheWriteTokens += ev.usage.cacheWriteTokens || 0
          }
          // final content là authority (đã parse args) — thay thế blocks đã stream
          if (Array.isArray(ev.content) && ev.content.length) {
            roundBlocks.length = 0
            roundBlocks.push(...ev.content)
          }
        }
      }

      // normalize tool_use blocks từ final (mọi adapter đều về chuẩn này)
      for (const b of roundBlocks) {
        if (b.type === 'tool_use') toolUses.push({ id: b.id, name: b.name, input: b.input || {} })
      }

      // lưu assistant message vào history (content blocks chuẩn)
      if (roundBlocks.length) {
        session.messages.push({ role: 'assistant', content: roundBlocks })
      }

      if (!toolUses.length || forceText) break

      // ——— execute tool calls ———
      // Capability parallelToolCalls=false → tuần tự hoá (chạy tuần tự vẫn đúng
      // ngữ nghĩa, chỉ chậm hơn). Tool execute luôn local Node — an toàn.
      const results = []
      for (const call of toolUses) {
        yield { type: 'tool', name: call.name, label: toolLabel(call.name, call.input) }
        const res = await executeTool(call.name, call.input, {
          agentId: agentId || `assistant:${sessionId.slice(0, 24)}`,
          role: agentName,
          req,
          progress: (msg) => { /* progress từ tool — emit event */ },
        })
        results.push({ call, res })
        yield { type: 'tool_result', tool: call.name, summary: res.summary, status: res.ok ? 'ok' : 'error' }
      }

      // tool_result message vào history
      session.messages.push({
        role: 'user',
        content: results.map(({ call, res }) => ({
          type: 'tool_result',
          tool_use_id: call.id,
          name: call.name,
          content: fenceResult(res.result),
          is_error: !res.ok,
        })),
      })
    }

    yield {
      type: 'turn_complete',
      usage,
      rounds: toolUseRound + 1,
      elapsedMs: Date.now() - started,
      text: assistantText,
    }
  } catch (e) {
    // AIError → message thân thiện, không lộ provider internals ra frontend
    const msg = e instanceof AIError ? userFacingMessage(e) : 'Lỗi hệ thống agent — thử lại sau.'
    yield { type: 'error', message: msg }
  }
}

function userFacingMessage(e) {
  switch (e.code) {
    case 'AUTH': return 'AI provider chưa cấu hình đúng key — xem AI_PROVIDERS.md.'
    case 'RATE_LIMIT': return 'Model quá tải — thử lại sau ít phút.'
    case 'TIMEOUT': return 'Agent suy nghĩ quá lâu — thử câu ngắn hơn.'
    case 'NO_PROVIDER': return 'Chưa cấu hình AI provider — chạy với mock. Xem docs/AI_PROVIDERS.md.'
    case 'CAPABILITY': return 'Model hiện tại không hỗ trợ tính năng cần thiết — đổi AI_MODEL/AI_PROVIDER.'
    default: return 'Lỗi kết nối AI provider — thử lại.'
  }
}

function toolLabel(name, input) {
  try {
    if (name === 'search_products') return `tìm "${String(input.query || '').slice(0, 30)}"`
    if (name === 'get_product' || name === 'check_stock' || name === 'get_reviews') return `${name} ${String(input.slug || '').slice(0, 30)}`
    if (name === 'compare_products') return `so sánh ${(input.slugs || []).length} sản phẩm`
    if (name === 'recommend_products') return `gợi ý theo nhu cầu`
    if (name === 'track_order') return `tra đơn ${String(input.refCode || '').slice(0, 12)}`
    if (name === 'add_to_cart') return `thêm ${String(input.slug || '').slice(0, 30)} size ${input.size}`
    return name
  } catch { return name }
}

module.exports = { runTurn, maxRounds }
