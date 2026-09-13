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

// ——— Plan artifact parser (explicit planning) ———
// Model viết <plan><step>…</step></plan> + <step-done>…</step-done> theo
// PLANNING_RULES. Parser stream 2-state: đang trong tag thì buffer, ngoài
// tag thì text thường yield ra SSE như cũ. Plan/step events cho UI render
// progress thật (task state thay vì chỉ tool chips).
const PLAN_TAGS = /<\/?plan>|<\/?step>|<\/?step-done>/

/**
 * Stateless incremental parser cho plan tags trong text stream.
 * chunk() nhận delta, trả list actions:
 *   {emit:'text', text} — yield cho user như cũ
 *   {emit:'plan', steps:[…]} — đủ </plan> rồi
 *   {emit:'step_done', label} — đủ </step-done>
 *   {buffer:...} không trả, state nằm trong closure
 */
function makePlanTracker() {
  let buf = ''          // text chưa quyết định được (có thể chứa tag dở)
  let mode = 'text'     // text | plan | step_done
  let planSteps = []
  let currentStep = ''
  let stepDoneText = ''

  function splitActions(out) {
    // tách buffer thành: [text-trước-tag, tag-match, phần-còn-lại]
    const m = buf.match(PLAN_TAGS)
    if (!m) return false
    const [full] = m
    const idx = m.index
    const before = buf.slice(0, idx)
    const rest = buf.slice(idx + full.length)
    buf = rest
    if (before && mode === 'text') out.push({ emit: 'text', text: before })
    // trong plan/step-done, before là nội dung tag (không hiện cho user)
    if (mode === 'plan') {
      if (full === '</step>') { planSteps.push((currentStep + before).trim()); currentStep = '' }
      else if (full === '<step>') currentStep = ''
      else if (full === '</plan>') { out.push({ emit: 'plan', steps: planSteps }); planSteps = [] ; mode = 'text' }
      else if (full === '<plan>') mode = 'plan'
    } else if (mode === 'step_done') {
      if (full === '</step-done>') { out.push({ emit: 'step_done', label: (stepDoneText + before).trim() }); stepDoneText = ''; mode = 'text' }
    } else {
      if (full === '<plan>') mode = 'plan'
      else if (full === '<step-done>') mode = 'step_done'
      // <step>/< /step> lẻ ngoài plan — tag rác, bỏ (text quanh nó đã emit)
    }
    return true
  }

  return {
    chunk(delta) {
      const out = []
      buf += delta
      while (splitActions(out)) { /* xử lý tag tiếp trong buf */ }
      // phần buffer không còn tag: giữ lại tối đa 11 ký tự cuối (chiều dài tag
      // dài nhất có thể dở = '<step-done>' 11) để chờ tag dở, phần còn lại text
      if (mode === 'text' && buf.length > 11) {
        out.push({ emit: 'text', text: buf.slice(0, -11) })
        buf = buf.slice(-11)
      } else if (mode === 'plan' && buf.length > 7) {
        currentStep += buf.slice(0, -7)
        buf = buf.slice(-7)
      } else if (mode === 'step_done' && buf.length > 11) {
        stepDoneText += buf.slice(0, -11)
        buf = buf.slice(-11)
      }
      return out
    },
    flush() {
      const out = []
      if (buf) { if (mode === 'text') out.push({ emit: 'text', text: buf }); buf = '' }
      return out
    },
  }
}

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
      const plan = makePlanTracker() // 1 tracker mỗi model-round (plan đầu turn)
      let roundTextRaw = ''

      for (;;) {
        const { done, value } = await stream.next()
        if (done) break
        const ev = value
        if (ev.type === 'text_delta') {
          roundTextRaw += ev.text
          for (const act of plan.chunk(ev.text)) {
            if (act.emit === 'text') {
              assistantText += act.text
              yield { type: 'text', text: act.text }
              if (!roundBlocks.length || roundBlocks[roundBlocks.length - 1]?.type !== 'text') {
                roundBlocks.push({ type: 'text', text: act.text })
              } else {
                roundBlocks[roundBlocks.length - 1].text += act.text
              }
            } else if (act.emit === 'plan') {
              yield { type: 'plan', steps: act.steps }
            } else if (act.emit === 'step_done') {
              yield { type: 'step_done', label: act.label }
            }
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
      // flush phần text đọng (tag dở cuối stream)
      for (const act of plan.flush()) {
        if (act.emit === 'text') {
          assistantText += act.text
          yield { type: 'text', text: act.text }
          if (!roundBlocks.length || roundBlocks[roundBlocks.length - 1]?.type !== 'text') {
            roundBlocks.push({ type: 'text', text: act.text })
          } else {
            roundBlocks[roundBlocks.length - 1].text += act.text
          }
        } else if (act.emit === 'plan') yield { type: 'plan', steps: act.steps }
        else if (act.emit === 'step_done') yield { type: 'step_done', label: act.label }
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
      // ctx.session cho provenance gate: catalog tools ghi seenSlugs,
      // add_to_cart chỉ nhận slug đã thấy (port gates.py của blueprint).
      const results = []
      for (const call of toolUses) {
        yield { type: 'tool', name: call.name, label: toolLabel(call.name, call.input) }
        const res = await executeTool(call.name, call.input, {
          agentId: agentId || `assistant:${sessionId.slice(0, 24)}`,
          role: agentName,
          req,
          session,
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

module.exports = { runTurn, maxRounds, makePlanTracker }
