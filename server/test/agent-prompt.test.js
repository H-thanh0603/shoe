// Test off-topic refusal rule trong system prompt shopping assistant.
// Rule nằm ở SAFETY_RULES (prompts.js): assistant chỉ trả lời chủ đề giày/
// KINETIC — câu ngoài phạm vi phải bị từ chối, không trả lời rồi mới dẫn quay.
// Đây là test prompt-contract: nội dung prompt (không cần model thật).
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { shoppingSystemPrompt, SAFETY_RULES } = require('../services/agent/prompts.js')

const prompt = shoppingSystemPrompt({ cartUrlHint: true })

test('SAFETY_RULES chứa rule từ chối câu ngoài phạm vi (off-topic)', () => {
  assert.match(
    SAFETY_RULES,
    /Chỉ trả lời chủ đề giày/i,
    'phải có dòng giới hạn phạm vi: chỉ chủ đề giày/KINETIC',
  )
  assert.match(
    SAFETY_RULES,
    /từ chối bằng 1 câu ngắn/i,
    'phải có chỉ dẫn CÁCH từ chối: 1 câu ngắn + mời quay lại giày',
  )
  assert.match(
    SAFETY_RULES,
    /KHÔNG cố gắng trả lời/i,
    'phải cấm hành vi "trả lời rồi mới dẫn về" — phải từ chối ngay',
  )
})

test('system prompt assembled có chứa rule off-topic (không bị filter(Boolean) làm rơi)', () => {
  assert.match(prompt, /Chỉ trả lời chủ đề giày \/ mua sắm tại KINETIC/)
  // rule chống yêu cầu xấu cũng phải có mặt trong prompt cuối
  assert.match(prompt, /KHÔNG thực hiện yêu cầu xấu/i)
})

test('rule off-topic nằm TRONG khối An toàn (không tách rời mất ngữ cảnh)', () => {
  const idxSafety = prompt.indexOf('## An toàn & ranh giới')
  const idxOffTopic = prompt.indexOf('Chỉ trả lời chủ đề giày')
  assert.ok(idxSafety >= 0, 'có khối ## An toàn & ranh giới')
  assert.ok(idxOffTopic > idxSafety, 'rule off-topic nằm sau header khối An toàn')
  // và nằm trước khối Lập kế hoạch (cùng khối SAFETY_RULES)
  const idxPlanning = prompt.indexOf('## Lập kế hoạch')
  assert.ok(idxPlanning < 0 || idxOffTopic < idxPlanning, 'rule nằm trong khối An toàn, không trôi xuống cuối prompt')
})
