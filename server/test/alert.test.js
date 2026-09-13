// Test alert check logic — mock fetch, không cần app thật.
// Chạy: node --test test/alert.test.js
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// state file riêng cho test (không dính production state)
const STATE = path.join(os.tmpdir(), 'kinetic-alert-test.json')

beforeEach(() => {
  process.env.ALERT_API_URL = 'http://mock'
  process.env.ALERT_STATE_FILE = STATE
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_CHAT_ID
  delete require.cache[require.resolve('../scripts/alert.js')]
  try { fs.unlinkSync(STATE) } catch {}
})
afterEach(() => { try { fs.unlinkSync(STATE) } catch {} })

const OK_METRICS = { app: {}, cache: { backend: 'memory' }, jobs: { done: 5, failed: 0 }, ai: { calls: 10, errors: 1 } }

function mockFetch(routes) {
  globalThis.fetch = async (url) => {
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) return handler()
    }
    return { status: 404, json: async () => ({}) }
  }
}

test('mọi check ổn → exit 0, KHÔNG alert', async () => {
  mockFetch([
    ['/healthz', () => ({ status: 200, json: async () => ({ ok: true }) })],
    ['/readyz', () => ({ status: 200, json: async () => ({ ok: true }) })],
    ['/metrics', () => ({ status: 200, json: async () => OK_METRICS })],
  ])
  const alert = require('../scripts/alert.js')
  // main() tự exit — nhưng vì code exit, wrap: gọi main và catch
  const code = await alert.__main()
  assert.equal(code, 0)
})

test('server chết → exit 1 + alert KHÔNG TỚI ĐƯỢC APP', async () => {
  globalThis.fetch = async () => { throw new Error('fetch failed') }
  const alert = require('../scripts/alert.js')
  const errors = []
  const origErr = console.error
  console.error = (...a) => errors.push(a.join(' '))
  const code = await alert.__main()
  console.error = origErr
  assert.equal(code, 1)
  assert.ok(errors.some((e) => e.includes('KHÔNG TỚI ĐƯỢC APP')), 'có message chết app')
})

test('jobs failed vượt ngưỡng + AI error cao → exit 1 với đúng message', async () => {
  process.env.ALERT_JOBS_FAILED_MAX = '3'
  mockFetch([
    ['/healthz', () => ({ status: 200, json: async () => ({ ok: true }) })],
    ['/readyz', () => ({ status: 200, json: async () => ({ ok: true }) })],
    ['/metrics', () => ({ status: 200, json: async () => ({ ...OK_METRICS, jobs: { failed: 5 }, ai: { calls: 10, errors: 8 } }) })],
  ])
  const alert = require('../scripts/alert.js')
  const errors = []
  const origErr = console.error
  console.error = (...a) => errors.push(a.join(' '))
  const code = await alert.__main()
  console.error = origErr
  assert.equal(code, 1)
  assert.ok(errors.some((e) => e.includes('jobs failed = 5')), 'báo jobs failed')
  assert.ok(errors.some((e) => e.includes('AI error rate')), 'báo AI error rate')
})

test('cooldown: vấn đề lặp lại trong 30p không spam', async () => {
  // state đã có CẢ 2 vấn đề (server chết sinh 2 problem) cách đây 1 phút
  fs.writeFileSync(STATE, JSON.stringify({
    'KHÔNG TỚI ĐƯỢC APP (fetch failed) — server chết hoặc mạng đứt': Date.now() - 60_000,
    'readyz không phản hồi: fetch failed': Date.now() - 60_000,
  }))
  globalThis.fetch = async () => { throw new Error('fetch failed') }
  const alert = require('../scripts/alert.js')
  const errors = []
  const origErr = console.error
  console.error = (...a) => errors.push(a.join(' '))
  const code = await alert.__main()
  console.error = origErr
  assert.equal(code, 1, 'vẫn exit 1 (compose thấy unhealthy)')
  assert.ok(errors.some((e) => e.includes('cooldown')), 'nhận diện cooldown')
})
