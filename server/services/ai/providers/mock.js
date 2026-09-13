// Mock provider — offline test + fallback chót khi không có provider thật nào.
//
// Scriptable: kịch bản là 1 list các "steps", mỗi step là ChatResult-shaped.
// Cho phép test agent loop (tool-call sequence) không cần network/key.
//
// AI_PROVIDER=mock → chạy được app + agent với câu trả lời cố định ("chế độ
// demo không model") — hữu ích khi development/CI không key.

'use strict'

const ID = 'mock'
const DEFAULT_MODEL = process.env.AI_MODEL || 'mock-model'

/**
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.script] — các "round" phản hồi (ChatResult shape).
 *   Mỗi phần tử: {content: [...], stopReason, usage}. Khi hết script → text mặc định.
 *   Special: nếu step có tool_use blocks, runtime sẽ gọi tool rồi quay lại.
 * @param {string} [opts.staticText]
 */
function makeMockAdapter(opts = {}) {
  let cursor = 0
  const script = opts.script || []
  const staticText = opts.staticText || 'Đây là phản hồi từ mock provider (không có model thật). Cấu hình AI_PROVIDER + API key để bật trí tuệ thật.'

  async function generate(req) {
    const step = script.length ? script[Math.min(cursor, script.length - 1)] : null
    cursor++
    const text = step?.content ? step.content : [{ type: 'text', text: staticText }]
    return {
      content: text,
      stopReason: step?.stopReason || 'end_turn',
      usage: step?.usage || { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model: DEFAULT_MODEL,
      provider: ID,
    }
  }

  async function* stream(req) {
    const step = script.length ? script[Math.min(cursor, script.length - 1)] : null
    cursor++
    const text = step?.content ? step.content : [{ type: 'text', text: staticText }]
    // emit từng text block thành nhiều delta để test SSE path thật
    for (const b of text) {
      if (b.type === 'text') {
        for (const piece of b.text.match(/.{1,8}/gs) || []) {
          yield { type: 'text_delta', text: piece, index: 0 }
        }
      } else if (b.type === 'tool_use') {
        yield { type: 'tool_input_delta', partialJson: JSON.stringify(b.input ?? {}), toolUseId: b.id, index: 1 }
      }
    }
    yield { type: 'final', content: text, stopReason: step?.stopReason || 'end_turn', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: DEFAULT_MODEL }
  }

  return {
    id: ID,
    displayName: 'Mock (offline)',
    capabilities: () => ({
      streaming: true,
      toolCalling: true,
      parallelToolCalls: true,
      structuredOutput: true,
      vision: false,
      reasoning: false,
    }),
    generate,
    stream,
    info: () => ({ configured: true, model: DEFAULT_MODEL }),
    // test hooks
    _reset: () => { cursor = 0 },
    _cursor: () => cursor,
  }
}

module.exports = { makeMockAdapter, id: ID }
