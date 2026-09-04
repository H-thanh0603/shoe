// Job queue bất đồng bộ, lưu Postgres — an toàn khi scale ngang:
// claim dùng SELECT ... FOR UPDATE SKIP LOCKED nên N worker không ăn trùng job.
// Quy ước: enqueue() không bao giờ throw (fail-open — request chính không vỡ vì job).
// Worker chạy poll mỗi 2s trong cùng process (server.js), hoặc process riêng với WORKER_ONLY=true.
const pool = require('../db.js')

const TYPES = ['order_confirmation', 'events_cleanup', 'low_stock_scan']
const POLL_MS = 2000

async function enqueue(type, payload = {}, opts = {}) {
  try {
    if (!TYPES.includes(type)) throw new Error(`Loại job lạ: ${type}`)
    const { rows: [j] } = await pool.query(
      `INSERT INTO jobs (type, payload, run_after, max_attempts)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4)
       RETURNING id, type, status`,
      [type, JSON.stringify(payload), String(opts.delaySec || 0), opts.maxAttempts || 5],
    )
    return j
  } catch (e) {
    console.error('[jobs] enqueue failed (fail-open):', e.message)
    return null
  }
}

// Claim 1 job pending tới hạn — transaction ngắn, SKIP LOCKED để worker khác lướt qua.
async function claimOne() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT id, type, payload, attempts, max_attempts FROM jobs
       WHERE status = 'pending' AND run_after <= now()
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`)
    if (!rows[0]) { await client.query('ROLLBACK'); return null }
    await client.query(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now() WHERE id = $1`,
      [rows[0].id])
    await client.query('COMMIT')
    return rows[0]
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

async function finish(id, ok, errMsg = null) {
  if (ok) {
    await pool.query(`UPDATE jobs SET status = 'done', last_error = NULL, updated_at = now() WHERE id = $1`, [id])
    return
  }
  // fail → retry với backoff 30s * attempts, hết lượt → failed (nằm lại để admin xem/retry tay)
  await pool.query(
    `UPDATE jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      last_error = $2, run_after = now() + (LEAST(attempts, 6) * 30 || ' seconds')::interval,
      updated_at = now() WHERE id = $1`,
    [id, errMsg])
}

// ——— handlers (mỗi type 1 hàm, throw = retry) ———
const handlers = {
  // Xác nhận đơn: hiện tại ghi log + bảng (móc gửi mail/SMS thật vào đây sau).
  async order_confirmation({ refCode, email, totalVnd }) {
    if (!refCode) throw new Error('Thiếu refCode')
    console.log(`[job] order_confirmation ${refCode} → ${email || 'guest'} (${Number(totalVnd || 0).toLocaleString('vi-VN')}₫)`)
  },
  // Dọn event tracking >90 ngày (comment trong 005 đã hẹn).
  async events_cleanup({ olderThanDays = 90 } = {}) {
    const { rowCount } = await pool.query(
      `DELETE FROM product_events WHERE created_at < now() - ($1 || ' days')::interval`,
      [String(olderThanDays)])
    if (rowCount) console.log(`[job] events_cleanup xóa ${rowCount} events cũ`)
  },
  // Quét variant sắp hết (stock <= ngưỡng) để admin nhập hàng.
  async low_stock_scan({ threshold = 3 } = {}) {
    const { rows } = await pool.query(
      `SELECT pv.id, pv.size, pv.stock, p.slug FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.stock <= $1 ORDER BY pv.stock LIMIT 50`, [threshold])
    for (const r of rows) console.log(`[job] low_stock ${r.slug} size ${r.size}: còn ${r.stock}`)
    return rows.length
  },
}

async function tickOnce() {
  const job = await claimOne()
  if (!job) return false
  try {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {})
    await handlers[job.type](payload)
    await finish(job.id, true)
  } catch (e) {
    console.error(`[jobs] #${job.id} ${job.type} lỗi (lần ${job.attempts + 1}):`, e.message)
    await finish(job.id, false, e.message)
  }
  return true
}

let timer = null
function startWorker() {
  if (timer) return
  const loop = async () => {
    try {
      // xử lý dồn tối đa 10 job mỗi lượt poll
      for (let i = 0; i < 10; i++) { if (!(await tickOnce())) break }
    } catch (e) {
      console.error('[jobs] poll lỗi:', e.message)
    } finally {
      timer = setTimeout(loop, POLL_MS)
    }
  }
  // lịch định kỳ: dọn events mỗi 24h + quét low-stock mỗi 6h (enqueue, worker khác cũng có thể nhận)
  const schedule = async () => {
    await enqueue('events_cleanup', { olderThanDays: 90 })
    await enqueue('low_stock_scan', { threshold: 3 })
  }
  schedule().catch(() => {})
  setInterval(schedule, 6 * 3600 * 1000).unref?.()
  loop()
}
function stopWorker() { if (timer) { clearTimeout(timer); timer = null } }

module.exports = { enqueue, tickOnce, startWorker, stopWorker, TYPES }
