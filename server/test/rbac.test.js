// Test RBAC: staff thiếu quyền 403, gán role cskh → đọc đơn được, audit ghi nhận.
// Run: API_URL=http://localhost:3100 node --test server/test/rbac.test.js (server chạy + seed admin)
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

let staffId
const staffEmail = `cskh${Date.now()}@test.vn`

async function adminJar() {
  const a = jar()
  const r = await api(a, 'POST', '/api/v1/auth/login', { email: 'admin@kinetic.vn', password: 'kinetic-admin' })
  assert.equal(r.body.success, true)
  return a
}

after(async () => {
  if (staffId) {
    await pool.query('DELETE FROM user_roles WHERE user_id = $1', [staffId])
    await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [staffId])
    await pool.query('DELETE FROM carts WHERE user_id = $1', [staffId])
    await pool.query('DELETE FROM users WHERE id = $1', [staffId])
  }
  await pool.end()
})

test('staff chưa có role: vào admin 403', async () => {
  const s = jar()
  const r = await api(s, 'POST', '/api/v1/auth/register', { email: staffEmail, password: 'matkhau123', name: 'CSKH Test' })
  assert.equal(r.body.success, true)
  staffId = r.body.data.id
  const o = await api(s, 'GET', '/api/v1/admin/orders')
  assert.equal(o.status, 403)
  assert.equal(o.body.error?.code, 'FORBIDDEN')
})

test('gán role cskh: đọc đơn được, sửa sản phẩm vẫn 403', async () => {
  const a = await adminJar()
  const s = jar()
  await api(s, 'POST', '/api/v1/auth/login', { email: staffEmail, password: 'matkhau123' })
  const g = await api(a, 'POST', `/api/v1/admin/users/${staffId}/roles`, { roleNames: ['cskh'] })
  assert.equal(g.body.success, true)
  const o = await api(s, 'GET', '/api/v1/admin/orders')
  assert.equal(o.body.success, true)
  const p = await api(s, 'POST', '/api/v1/admin/products', { name: 'X', slug: 'x', brand: 'B', priceVnd: 1, colors: ['#fff'], variants: [{ size: 40, stock: 1 }] })
  assert.equal(p.status, 403)
  // role lạ → 400; tự sửa mình → 400
  const bad1 = await api(a, 'POST', `/api/v1/admin/users/${staffId}/roles`, { roleNames: ['tong-thong'] })
  assert.equal(bad1.body.error?.code, 'UNKNOWN_ROLE')
  const { rows: [admin] } = await pool.query("SELECT id FROM users WHERE email = 'admin@kinetic.vn'")
  const bad2 = await api(a, 'POST', `/api/v1/admin/users/${admin.id}/roles`, { roleNames: ['cskh'] })
  assert.equal(bad2.body.error?.code, 'SELF_EDIT')
})

test('audit log ghi nhận gán role', async () => {
  const a = await adminJar()
  const l = await api(a, 'GET', '/api/v1/admin/audit-logs?action=user.roles&limit=5')
  assert.equal(l.body.success, true)
  assert.ok(l.body.data.length >= 1)
  assert.equal(l.body.data[0].action, 'user.roles')
})

test('thu vai trò: mất quyền ngay', async () => {
  const a = await adminJar()
  const s = jar()
  await api(s, 'POST', '/api/v1/auth/login', { email: staffEmail, password: 'matkhau123' })
  assert.equal((await api(s, 'GET', '/api/v1/admin/orders')).body.success, true)
  assert.equal((await api(a, 'POST', `/api/v1/admin/users/${staffId}/roles`, { roleNames: [] })).body.success, true)
  assert.equal((await api(s, 'GET', '/api/v1/admin/orders')).status, 403)
})
