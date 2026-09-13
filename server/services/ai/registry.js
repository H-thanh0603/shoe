// Provider registry — AI_PROVIDER env → adapter instance + fallback chain.
//
// Một nơi duy nhất biết tên provider. Thêm provider mới (yêu cầu #9 final
// deliverable): tạo file trong providers/ + thêm 1 dòng REGISTER. Đổi provider
// = đổi env (AI_PROVIDER=...), không sửa code agent (yêu cầu #6).
//
// Env (server/.env):
//   AI_PROVIDER=deepseek|openrouter|openai|anthropic|gemini|tokenrouter|mock|<openai-compat tùy ý>
//   AI_MODEL=...                 — model cho provider chính
//   AI_API_KEY=...                — key cho provider chính (tiện khi đổi nhanh)
//   AI_PROVIDER_FALLBACKS=gemini,deepseek  — chain dự phòng
//   AI_FALLBACK_MODEL_<ID>=...    — model cho provider fallback (vd AI_FALLBACK_MODEL_GEMINI)
//   AI_FALLBACK_KEY_<ID>=...      — key cho provider fallback
//   # per-provider (tương đương AI_API_KEY nhưng riêng):
//   DEEPSEEK_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY,
//   TOKENROUTER_API_KEY, GOOGLE_API_KEY/GEMINI_API_KEY
//   # custom OpenAI-compatible bất kỳ:
//   AI_CUSTOM_PROVIDER_NAME=sql-chat  AI_CUSTOM_BASE_URL=http://vllm:8000 …

'use strict'

const anthropicAdapter = require('./providers/anthropic.js')
const geminiAdapter = require('./providers/gemini.js')
const { makeOpenaiCompatAdapter } = require('./providers/openai-compat.js')
const { makeMockAdapter } = require('./providers/mock.js')
const { AIError } = require('./types.js')

// ————————————————————————————————————————————————
// BUILT-IN PROVIDERS — mỗi provider 1 entry, config từ env
// Model ưu tiên: AI_MODEL (dùng chung khi đổi provider) > <PROVIDER>_MODEL > default.
// Key ưu tiên: AI_API_KEY > <PROVIDER>_API_KEY.
// ————————————————————————————————————————————————

function pickModel(providerConst, global) {
  return process.env[providerConst] || process.env.AI_MODEL || global
}

function pickKey(providerConst) {
  return process.env.AI_API_KEY || process.env[providerConst] || ''
}

const deepseek = makeOpenaiCompatAdapter({
  id: 'deepseek',
  displayName: 'DeepSeek (OpenAI-compatible)',
  defaultModel: () => pickModel('DEEPSEEK_MODEL', 'deepseek-chat'),
  baseUrl: () => process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  apiKey: () => pickKey('DEEPSEEK_API_KEY'),
})

const openrouter = makeOpenaiCompatAdapter({
  id: 'openrouter',
  displayName: 'OpenRouter (OpenAI-compatible)',
  defaultModel: () => pickModel('OPENROUTER_MODEL', 'openai/gpt-4o-mini'),
  baseUrl: () => process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api',
  apiKey: () => pickKey('OPENROUTER_API_KEY'),
  // openrouter khuyến nghị app tự xưng danh — không bắt buộc
  extraHeaders: () => ({
    ...(process.env.OPENROUTER_APP_URL ? { 'HTTP-Referer': process.env.OPENROUTER_APP_URL } : {}),
    ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
  }),
  capabilityDefaults: { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: true, reasoning: true },
})

const tokenrouter = makeOpenaiCompatAdapter({
  id: 'tokenrouter',
  displayName: 'TokenRouter (OpenAI-compatible)',
  defaultModel: () => pickModel('TOKENROUTER_MODEL', process.env.AI_MODEL || 'anthropic/claude-sonnet-4.5'),
  baseUrl: () => process.env.TOKENROUTER_BASE_URL || 'https://api.tokenrouter.ai',
  apiKey: () => pickKey('TOKENROUTER_API_KEY'),
  capabilityDefaults: { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: true, reasoning: true },
})

const openai = makeOpenaiCompatAdapter({
  id: 'openai',
  displayName: 'OpenAI (OpenAI-compatible)',
  defaultModel: () => pickModel('OPENAI_MODEL', 'gpt-4o-mini'),
  baseUrl: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  apiKey: () => pickKey('OPENAI_API_KEY'),
  capabilityDefaults: { streaming: true, toolCalling: true, parallelToolCalls: true, structuredOutput: true, vision: true, reasoning: false },
})

/** @type {Map<string, import('./types.js').AIProvider>} */
const REGISTER = new Map([
  ['anthropic', anthropicAdapter],
  ['deepseek', deepseek],
  ['openrouter', openrouter],
  ['tokenrouter', tokenrouter],
  ['openai', openai],
  ['gemini', geminiAdapter],
  ['mock', null], // lazy tạo (state per-process)
])

const _lazy = new Map()
function getAdapter(id) {
  if (id === 'mock') {
    if (!_lazy.has('mock')) _lazy.set('mock', makeMockAdapter())
    return _lazy.get('mock')
  }
  // custom OpenAI-compatible tự khai báo qua env:
  if (id && id.startsWith('custom:')) {
    const name = id.slice('custom:'.length)
    const cacheKey = `custom:${name}`
    if (_lazy.has(cacheKey)) return _lazy.get(cacheKey)
    const baseUrl = process.env[`AI_CUSTOM_${name.toUpperCase()}_BASE_URL`]
    if (!baseUrl) throw new AIError('NO_PROVIDER', `Custom provider "${name}" thiếu AI_CUSTOM_${name.toUpperCase()}_BASE_URL`, { status: 400 })
    const adapter = makeOpenaiCompatAdapter({
      id: `custom:${name}`,
      displayName: `Custom (${name})`,
      defaultModel: () => process.env[`AI_CUSTOM_${name.toUpperCase()}_MODEL`] || process.env.AI_MODEL || 'default',
      baseUrl: () => baseUrl,
      apiKey: () => process.env[`AI_CUSTOM_${name.toUpperCase()}_API_KEY`] || '',
      allowNoKey: true, // self-host có thể không key
    })
    _lazy.set(cacheKey, adapter)
    return adapter
  }
  const a = REGISTER.get(id)
  if (!a) return null
  return a
}

// ————————————————————————————————————————————————
// Resolution API
// ————————————————————————————————————————————————

/** Provider chính theo AI_PROVIDER (default: deepseek — có sẵn key test). */
function activeProviderId() {
  const raw = (process.env.AI_PROVIDER || '').trim().toLowerCase()
  if (raw) return raw
  // không set → tự dò theo key có sẵn (ưu tiên thân thiện dev)
  for (const [envName, id] of [
    ['DEEPSEEK_API_KEY', 'deepseek'],
    ['OPENROUTER_API_KEY', 'openrouter'],
    ['OPENAI_API_KEY', 'openai'],
    ['ANTHROPIC_API_KEY', 'anthropic'],
    ['GOOGLE_API_KEY', 'gemini'],
    ['GEMINI_API_KEY', 'gemini'],
  ]) {
    if (process.env[envName]) return id
  }
  return 'mock'
}

function activeProvider() {
  const id = activeProviderId()
  const adapter = getAdapter(id)
  if (!adapter) {
    throw new AIError('NO_PROVIDER', `AI_PROVIDER="${id}" không tồn tại. Các provider có sẵn: ${[...REGISTER.keys()].filter((k) => k !== 'mock').join(', ')}`, { status: 400 })
  }
  return adapter
}

/**
 * Fallback chain: [active, ...AI_PROVIDER_FALLBACKS]. Bỏ provider chưa
 * configure key (trừ mock luôn available). Trả adapter thực, không id.
 * @returns {import('./types.js').AIProvider[]}
 */
function fallbackChain() {
  const ids = [activeProviderId()]
  for (const raw of (process.env.AI_PROVIDER_FALLBACKS || '').split(',')) {
    const id = raw.trim().toLowerCase()
    if (id && !ids.includes(id)) ids.push(id)
  }
  // mock luôn cuối (nếu primary không phải mock) — degraded mode thay vì crash
  if (!ids.includes('mock')) ids.push('mock')
  const out = []
  for (const id of ids) {
    try {
      const a = getAdapter(id)
      if (a && a.info().configured) out.push(a)
    } catch { /* custom thiếu env — bỏ */ }
  }
  if (!out.length) out.push(getAdapter('mock'))
  return out
}

/** For /metrics + debug endpoint — KHÔNG bao giờ chứa key. */
function configSnapshot() {
  const chain = []
  try { chain.push(providerSummary(activeProvider())) } catch (e) { chain.push({ id: 'none', error: e.message }) }
  for (const a of fallbackChain().slice(1)) chain.push(providerSummary(a))
  return {
    active: activeProviderId(),
    chain,
    requireTools: process.env.AI_REQUIRE_TOOLS !== 'false',
  }
}

function providerSummary(adapter) {
  const info = adapter.info()
  const caps = adapter.capabilities()
  return {
    id: adapter.id,
    model: info.model,
    baseUrl: info.baseUrl,
    configured: info.configured,
    capabilities: caps,
  }
}

module.exports = {
  activeProvider,
  activeProviderId,
  fallbackChain,
  configSnapshot,
  getAdapter,
  // test hooks
  _providers: () => [...REGISTER.keys()],
}
