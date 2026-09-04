// Chạy migrations/*.sql theo thứ tự tên file. Track đã chạy trong bảng _migrations.
// Usage: npm run db:migrate
require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const pool = require('./db.js')

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const dir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const { rows: done } = await pool.query('SELECT name FROM _migrations')
  const doneSet = new Set(done.map((r) => r.name))

  for (const f of files) {
    if (doneSet.has(f)) { console.log('skip (đã chạy):', f); continue }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    await pool.query(sql)
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [f])
    console.log('migrated:', f)
  }
  console.log('done')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())
