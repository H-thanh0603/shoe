// Test thu hồi session: logout, logout-all, refresh rotation + reuse, reset-password 1-lần-dùng.
// Run: API_URL=http://localhost:3100 node --test server/test/auth.test.js (server phải đang chạy)
const { test, after } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:3100'
const pool = require('../db.js')

const jar = () => ({ cookie: '' })
async function api(j, method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(j.cookie ? { cookie: j.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const kv = c.split(';')[0]
    j.cookies = { ...(j.cookies || {}), [kv.split('=')[0]]: kv }
  }
  if (j.cookies) j.cookie = Object.values(j.cookies).join('; ')
  return { status: r.status, body: await r.json() }
}

const emails = []
const mkEmail = (p) => { const e = `${p}${Date.now()}@test.vn`; emails.push(e); return e }
const reg = (j, email) => api(j, 'POST', '/api/v1/auth/register', { email, password: 'matkhau123', name: 'Auth Tester' })

after(async () => {
  for (const e of emails) {
    const { rows: [u] } = await pool.query('SELECT id FROM users WHERE email = $1', [e])
    if (!u) continue
    await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [u.id])
    await pool.query('DELETE FROM reviews WHERE user_id = $1', [u.id])
    await pool.query('DELETE FROM wishlist_items WHERE user_id = $1', [u.id])
    await pool.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)', [u.id])
    await pool.query('DELETE FROM carts WHERE user_id = $1', [u.id])
    await pool.query('DELETE FROM users WHERE id = $1', [u.id])
  }
  await pool.end()
})

test('logout: access chết ngay, refresh cũng chết', async () => {
  const j = jar()
  const r = await reg(j, mkEmail('logout'))
  assert.equal(r.body.success, true)
  assert.equal((await api(j, 'GET', '/api/v1/auth/me')).body.success, true)
  assert.equal((await api(j, 'POST', '/api/v1/auth/logout')).body.success, true)
  assert.equal((await api(j, 'GET', '/api/v1/auth/me')).body.error?.code, 'UNAUTHORIZED')
  assert.equal((await api(j, 'POST', '/api/v1/auth/refresh')).body.error?.code, 'UNAUTHORIZED')
})

test('logout-all: đá session thiết bị khác', async () => {
  const a = jar(), b = jar()
  const email = mkEmail('logoutall')
  assert.equal((await reg(a, email)).body.success, true)
  assert.equal((await api(b, 'POST', '/api/v1/auth/login', { email, password: 'matkhau123' })).body.success, true)
  assert.equal((await api(b, 'GET', '/api/v1/auth/me')).body.success, true)
  assert.equal((await api(a, 'POST', '/api/v1/auth/logout-all')).body.success, true)
  assert.equal((await api(a, 'GET', '/api/v1/auth/me')).body.error?.code, 'UNAUTHORIZED')
  assert.equal((await api(b, 'GET', '/api/v1/auth/me')).body.error?.code, 'UNAUTHORIZED')
  assert.equal((await api(b, 'POST', '/api/v1/auth/refresh')).body.error?.code, 'UNAUTHORIZED')
})

test('refresh rotation: dùng lại refresh cũ → cả session chết', async () => {
  const j = jar()
  const email = mkEmail('rotation')
  assert.equal((await reg(j, email)).body.success, true)
  const oldRefresh = (j.cookies?.refresh_token || '').split(';')[0]
  assert.equal((await api(j, 'POST', '/api/v1/auth/refresh')).body.success, true)
  // refresh cũ đã xoay vòng — dùng lại = reuse → 401 + session bị revoke (đường refresh chết hẳn)
  const r2 = await fetch(BASE + '/api/v1/auth/refresh', { method: 'POST', headers: { cookie: oldRefresh } })
  assert.equal(r2.status, 401)
  assert.equal((await api(j, 'POST', '/api/v1/auth/refresh')).body.error?.code, 'UNAUTHORIZED')
})

test('reset-password: 1-lần-dùng + đá session cũ + pass mới login được', async () => {
  const j = jar(), other = jar()
  const email = mkEmail('resetpw')
  assert.equal((await reg(j, email)).body.success, true)
  assert.equal((await api(other, 'POST', '/api/v1/auth/login', { email, password: 'matkhau123' })).body.success, true)
  const fg = await api(j, 'POST', '/api/v1/auth/forgot-password', { email })
  const resetToken = fg.body.data.resetToken
  assert.ok(resetToken)
  assert.equal((await api(j, 'POST', '/api/v1/auth/reset-password', { resetToken, password: 'matkhaumoi456' })).body.success, true)
  // dùng lại link → chết
  assert.equal((await api(j, 'POST', '/api/v1/auth/reset-password', { resetToken, password: 'matkhaumoi789' })).body.error?.code, 'INVALID_TOKEN')
  // session cũ (cả 2 máy) chết
  assert.equal((await api(j, 'GET', '/api/v1/auth/me')).body.error?.code, 'UNAUTHORIZED')
  assert.equal((await api(other, 'GET', '/api/v1/auth/me')).body.error?.code, 'UNAUTHORIZED')
  // pass mới login được, pass cũ không
  const k = jar()
  assert.equal((await api(k, 'POST', '/api/v1/auth/login', { email, password: 'matkhaumoi456' })).body.success, true)
  assert.equal((await api(jar(), 'POST', '/api/v1/auth/login', { email, password: 'matkhau123' })).body.error?.code, 'INVALID_CREDENTIALS')
})
