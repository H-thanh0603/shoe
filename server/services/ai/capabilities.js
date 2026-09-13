// Capability store — per (provider, model) khả năng gì có/mất.
//
// Không assume mọi model như nhau (yêu cầu #4): adapter khai báo defaults,
// env override per-model (`AI_MODEL_CAPABILITIES` — JSON: model substring →
// patch). Runtime/client đọc capability để degrade gracefully:
//  - thiếu streaming     → client queue non-stream, emit 1 lần
//  - thiếu toolCalling   → runtime bỏ tools khỏi request (hoặc fail nếu bắt buộc)
//  - thiếu parallelToolCalls → runtime tuần tự hoá tool calls trong 1 round

'use strict'

/** @type {Record<string, import('./types.js').ProviderCapabilities>} */
const KNOWN_MODEL_PATCHES = {
  // reasoning models không tool-calling ổn định / không stream reasoning
  'deepseek-reasoner': { toolCalling: false, parallelToolCalls: false, structuredOutput: false, reasoning: true },
  'o1-mini': { toolCalling: false, parallelToolCalls: false, structuredOutput: false },
  'o3-mini': { parallelToolCalls: false },
}

/**
 * Đọc patch từ env AI_MODEL_CAPABILITIES (JSON string → map substring→patch),
 * gộp với bảng biết sẵn. Format:
 *   AI_MODEL_CAPABILITIES={"deepseek-chat":{"parallelToolCalls":false}}
 */
function envModelPatches() {
  const raw = process.env.AI_MODEL_CAPABILITIES
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    console.warn('[ai] AI_MODEL_CAPABILITIES không parse được JSON — bỏ qua')
    return {}
  }
}

/**
 * Hợp nhất capability: adapter defaults + patches (model match theo substring,
 * case-insensitive — đủ cho các naming scheme "provider/model").
 * @param {string} providerId
 * @param {string} model
 * @param {import('./types.js').ProviderCapabilities} adapterDefaults
 * @returns {import('./types.js').ProviderCapabilities}
 */
function resolveCapabilities(providerId, model, adapterDefaults) {
  const patches = { ...KNOWN_MODEL_PATCHES, ...envModelPatches() }
  const out = { ...adapterDefaults }
  const needle = String(model || '').toLowerCase()
  for (const [frag, patch] of Object.entries(patches)) {
    if (needle.includes(frag.toLowerCase())) Object.assign(out, patch)
  }
  return out
}

module.exports = { resolveCapabilities, KNOWN_MODEL_PATCHES }
