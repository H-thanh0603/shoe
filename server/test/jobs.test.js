// Test job queue trên DB thật (cần Postgres local + đã migrate 012).
// Run: npm run test:jobs trong server/
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const pool = require('../db.js')
const jobs = require('../services/jobs.js')

after(async () => {
  await pool.query(`DELETE FROM jobs WHERE payload->>'ut' = '1'`)
  await pool.end()
})

test('enqueue → tickOnce xử lý xong (done)', async () => {
  const j = await jobs.enqueue('order_confirmation', { ut: '1', refCode: 'KIN-TEST', totalVnd: 1000 })
  assert.ok(j?.id)
  assert.equal(await jobs.tickOnce(), true)
  const { rows: [row] } = await pool.query('SELECT status FROM jobs WHERE id = $1', [j.id])
  assert.equal(row.status, 'done')
})

test('handler lỗi → pending retry + ghi last_error', async () => {
  const j = await jobs.enqueue('order_confirmation', { ut: '1' }) // thiếu refCode → throw
  assert.equal(await jobs.tickOnce(), true)
  const { rows: [row] } = await pool.query('SELECT status, last_error, attempts FROM jobs WHERE id = $1', [j.id])
  assert.equal(row.status, 'pending')
  assert.ok(row.last_error)
  assert.equal(row.attempts, 1)
})

test('tickOnce khi hết việc → false', async () => {
  await pool.query(`DELETE FROM jobs WHERE payload->>'ut' = '1'`)
  assert.equal(await jobs.tickOnce(), false)
})
