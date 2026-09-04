// Chạy migrations/*.sql theo thứ tự tên file. Track đã chạy trong bảng _migrations.
// Usage: npm run db:migrate
// Deploy multi-replica (app + worker + cron cùng migrate lúc boot): giữ advisory lock
// xuyên suốt để chỉ 1 migrator chạy — không lock thì CREATE TABLE IF NOT EXISTS đua nhau
// crash với `duplicate key pg_type_typname_nsp_index` (đã gặp thật khi scale app=2).
require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const pool = require('./db.js')

const LOCK_KEY = 2026090401 // khóa migrate cố định, không đụng job nào khác

async function main() {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const dir = path.join(__dirname, 'migrations')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const { rows: done } = await client.query('SELECT name FROM _migrations')
    const doneSet = new Set(done.map((r) => r.name))

    for (const f of files) {
      if (doneSet.has(f)) { console.log('skip (đã chạy):', f); continue }
      const sql = fs.readFileSync(path.join(dir, f), 'utf8')
      await client.query(sql)
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f])
      console.log('migrated:', f)
    }
    console.log('done')
  } finally {
    // pg_advisory_lock là session-level: đóng connection là tự nhả
    client.release()
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())
