// Cron 1-lượt: enqueue việc định kỳ rồi thoát (không treo process).
// Chạy bởi service `cron` trong compose mỗi 6h. Idempotent: enqueue trùng cũng vô hại
// (events_cleanup xóa theo điều kiện, low_stock_scan chỉ đọc).
// Usage: node cron.js
require('dotenv').config()
const pool = require('./db.js')
const { enqueue } = require('./services/jobs.js')

async function main() {
  const a = await enqueue('events_cleanup', { olderThanDays: 90 })
  const b = await enqueue('low_stock_scan', { threshold: 3 })
  // PITR drill định kỳ khi đã cấu hình đích backup — PITR_CRON=0 để tắt.
  // Worker nào nhận cũng chạy được: pg_basebackup nằm trong image postgres.
  let c = null
  if (process.env.PITR_BASE_DIR && process.env.PITR_CRON !== '0') {
    c = await enqueue('pitr_drill', {})
  }
  console.log(`cron: enqueued events_cleanup#${a?.id} low_stock_scan#${b?.id}${c ? ` pitr_drill#${c.id}` : ''}`)
}

main()
  .catch((e) => { console.error('cron lỗi:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())
