// Job queue bất đồng bộ, lưu Postgres — an toàn khi scale ngang:
// claim dùng SELECT ... FOR UPDATE SKIP LOCKED nên N worker không ăn trùng job.
// Quy ước: enqueue() không bao giờ throw (fail-open — request chính không vỡ vì job).
// Worker chạy poll mỗi 2s trong cùng process (server.js), hoặc process riêng với WORKER_ONLY=true.
const pool = require('../db.js')
const mailer = require('./mailer.js')

const TYPES = ['order_confirmation', 'events_cleanup', 'low_stock_scan', 'vnpay_refund', 'analytics_rollup', 'cart_purge', 'watchlist_scan', 'watchlist_alert', 'pitr_drill']
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
  // Xác nhận đơn: gửi mail SMTP thật (thiếu cấu hình SMTP → mailer skip, vẫn done).
  async order_confirmation({ refCode, email, totalVnd }) {
    if (!refCode) throw new Error('Thiếu refCode')
    const fmt = Number(totalVnd || 0).toLocaleString('vi-VN')
    await mailer.send({
      to: email,
      subject: `Xác nhận đơn ${refCode} — KINETIC`,
      text: `Cảm ơn bạn đã đặt hàng tại KINETIC.\nMã đơn: ${refCode}\nTổng tiền: ${fmt}₫\nTra cứu: /track?code=${refCode}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto">
        <h2 style="letter-spacing:.2em">KINETIC</h2>
        <p>Cảm ơn bạn đã đặt hàng. Đơn <b>${refCode}</b> đã được ghi nhận.</p>
        <p>Tổng tiền: <b>${fmt}₫</b></p>
        <p>Tra cứu đơn: <a href="${process.env.SITE_URL || ''}/track?code=${refCode}">${refCode}</a></p>
      </div>`,
    })
    console.log(`[job] order_confirmation ${refCode} → ${email || 'guest'} (${fmt}₫)`)
  },
  // Dọn event tracking >90 ngày (comment trong 005 đã hẹn).
  async events_cleanup({ olderThanDays = 90 } = {}) {
    const { rowCount } = await pool.query(
      `DELETE FROM product_events WHERE created_at < now() - ($1 || ' days')::interval`,
      [String(olderThanDays)])
    if (rowCount) console.log(`[job] events_cleanup xóa ${rowCount} events cũ`)
  },
  // Rollup doanh thu theo ngày: upsert hôm nay + 7 ngày gần nhất (đơn đổi trạng
  // thái muộn vẫn đúng). Dashboard đọc analytics_daily — O(ngày) thay vì O(orders).
  async analytics_rollup() {
    const { rowCount } = await pool.query(
      `INSERT INTO analytics_daily (day, orders, revenue, pending)
       SELECT created_at::date AS day,
         COUNT(*) FILTER (WHERE status IN ('paid','shipped','done')),
         COALESCE(SUM(total_vnd) FILTER (WHERE status IN ('paid','shipped','done')), 0),
         COUNT(*) FILTER (WHERE status = 'pending')
       FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY day
       ON CONFLICT (day) DO UPDATE SET orders = EXCLUDED.orders, revenue = EXCLUDED.revenue,
         pending = EXCLUDED.pending, updated_at = now()`)
    return rowCount
  },
  // Xoá giỏ guest rỗng >30 ngày (bảng carts phình làm join chậm). Giỏ user + giỏ có đồ giữ.
  async cart_purge({ olderThanDays = 30 } = {}) {
    const { rowCount } = await pool.query(
      `DELETE FROM carts WHERE user_id IS NULL AND created_at < now() - ($1 || ' days')::interval
       AND NOT EXISTS (SELECT 1 FROM cart_items WHERE cart_id = carts.id)`,
      [String(olderThanDays)])
    if (rowCount) console.log(`[job] cart_purge xóa ${rowCount} giỏ guest rỗng`)
    return rowCount
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
  // Proactive: quét watchlist — giá chạm target hoặc size có hàng trở lại →
  // mail 1 lần/đợt (notified_at guard). Thiếu SMTP → mailer skip, KHÔNG set
  // notified (đợt sau báo lại khi đã cấu hình).
  async watchlist_scan({ limit = 100 } = {}) {
    const { rows } = await pool.query(
      `SELECT w.id, w.email, w.slug, w.size, w.target_vnd, w.notified_at,
              p.name, p.price_vnd,
              (SELECT COALESCE(SUM(pv.stock), 0) FROM product_variants pv
                JOIN products p2 ON p2.id = pv.product_id
                WHERE p2.slug = w.slug AND (w.size IS NULL OR pv.size = w.size)) AS stock
       FROM watchlist w JOIN products p ON p.slug = w.slug AND p.is_active
       WHERE w.notified_at IS NULL
       ORDER BY w.id LIMIT $1`, [limit])
    let sent = 0
    for (const w of rows) {
      // target đặt → báo khi giá chạm; không target → báo khi có hàng trở lại
      const fire = w.target_vnd != null ? w.price_vnd <= w.target_vnd : Number(w.stock) > 0
      if (!fire) continue
      const fmt = Number(w.price_vnd).toLocaleString('vi-VN')
      const why = w.target_vnd != null
        ? `giá ${fmt}₫ đã chạm mục tiêu ${Number(w.target_vnd).toLocaleString('vi-VN')}₫`
        : `size ${w.size ?? 'mọi size'} đã có hàng (${w.stock} đôi)`
      const id = await mailer.send({
        to: w.email,
        subject: `KINETIC: ${w.name} — ${why}`,
        text: `${w.name}\n${why}\nXem: /san-pham/${w.slug}\nBỏ theo dõi: trả lời mail này hoặc nhắn shop.`,
        html: `<p><b>${w.name}</b> — ${why}.</p><p><a href="${process.env.SITE_URL || ''}/san-pham/${w.slug}">Xem sản phẩm</a></p>`,
      })
      if (id) {
        await pool.query('UPDATE watchlist SET notified_at = now() WHERE id = $1', [w.id])
        sent += 1
      }
    }
    return { checked: rows.length, sent }
  },
  // Hoàn tiền VNPay nền (admin hủy đơn paid): provider chậm/timeout không giữ request.
  // Guard refund_pending — retry trùng không hoàn 2 lần (claim SKIP LOCKED + status check).
  async vnpay_refund({ orderId }) {
    if (!orderId) throw new Error('Thiếu orderId')
    const { rows: [o] } = await pool.query(
      `SELECT id, ref_code, total_vnd, payment_txn_ref, payment_method, payment_status
       FROM orders WHERE id = $1 FOR UPDATE`, [orderId])
    if (!o) throw new Error('Không tìm thấy đơn')
    if (o.payment_status === 'refunded') return 'already-refunded'
    if (o.payment_status !== 'refund_pending') throw new Error(`Trạng thái không hoàn được: ${o.payment_status}`)
    if (o.payment_method !== 'vnpay' || !o.payment_txn_ref) {
      await pool.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId])
      return 'cod-marked'
    }
    const vnpay = require('./vnpay.js')
    const result = await vnpay.requestRefund({
      orderId: o.id, amountVnd: o.total_vnd, transactionNo: o.payment_txn_ref,
      user: 'job:vnpay_refund', ip: '127.0.0.1',
    })
    await pool.query('UPDATE orders SET payment_status = $2, payment_refund_note = $3 WHERE id = $1',
      [o.id, result.ok ? 'refunded' : 'refund_failed', `${result.ok ? 'OK' : 'FAIL'} ${result.responseCode || ''} ${result.message}`.slice(0, 300)])
    if (!result.ok) throw new Error(`Refund thất bại: ${result.message}`)
    return 'refunded'
  },
  // PITR drill định kỳ: physical basebackup vào PITR_BASE_DIR (mount/host path —
  // container postgres chạy cùng image có pg_basebackup; worker host chỉ orchestrator,
  // không cần client). Role thiếu REPLICATION (dev native / managed PG) → fallback
  // pg_dump custom format — vẫn restore-được, chỉ mất khả năng PITR về thời điểm giữa
  // 2 base. Lấp nợ "chưa drill PITR" trong docs/BACKUP_DRILLS.md. Throw → retry backoff.
  async pitr_drill({ dest } = {}) {
    const { execFile } = require('node:child_process')
    const fs = require('node:fs')
    const path = require('node:path')
    const base = dest || process.env.PITR_BASE_DIR
    if (!base) throw new Error('Thiếu PITR_BASE_DIR (hoặc payload.dest) — không biết backup vào đâu')
    const conn = process.env.DATABASE_URL || ''
    let host = process.env.PGHOST || '127.0.0.1', port = process.env.PGPORT || '5432', user = process.env.PGUSER || 'kinetic', db = 'kinetic'
    try { const u = new URL(conn); host = process.env.PGHOST || u.hostname; port = process.env.PGPORT || u.port; user = process.env.PGUSER || u.username; db = u.pathname.slice(1) } catch {}
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = path.join(base, `base-${stamp}-${process.pid}${Math.random().toString(36).slice(2, 5)}`)
    fs.mkdirSync(dir, { recursive: true })
    const run = (cmd, args) => new Promise((resolve, reject) => {
      const t0 = Date.now()
      execFile(cmd, args, { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || '' }, timeout: 15 * 60 * 1000 },
        (err) => (err ? reject(err) : resolve(Date.now() - t0)))
    })
    let mode = 'physical'
    let durMs
    try {
      durMs = await run('pg_basebackup',
        ['-h', host, '-p', port, '-U', user, '-D', dir, '-Fp', '-Xs', '-P', '-c', 'fast'])
    } catch (e) {
      // Không có quyền REPLICATION (native dev, managed PG) → logical dump cùng vị trí.
      if (!/WAL sender|replication/i.test(String(e.message))) throw e
      mode = 'logical'
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      durMs = await run('pg_dump', ['-h', host, '-p', port, '-U', user, '-Fc', '-f', path.join(dir, `${db}.dump`), db])
      fs.writeFileSync(path.join(dir, 'MODE'), 'logical (pg_dump — thiếu REPLICATION, không PITR điểm giữa được)\n')
    }
    let bytes = 0
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name)
      if (f.isDirectory()) walk(p)
      else bytes += fs.statSync(p).size
    } }
    walk(dir)
    console.log(`[job] pitr_drill ok (${mode}): ${dir} — ${(bytes / 1048576).toFixed(1)}MB, ${(durMs / 1000).toFixed(0)}s, db=${db}`)
    return { dir, bytes, durMs, mode }
  },
}

async function tickOnce() {  const job = await claimOne()
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
    await enqueue('analytics_rollup', {})
    await enqueue('cart_purge', { olderThanDays: 30 })
    await enqueue('watchlist_scan', {})
  }
  schedule().catch(() => {})
  setInterval(schedule, 6 * 3600 * 1000).unref?.()
  loop()
}
function stopWorker() { if (timer) { clearTimeout(timer); timer = null } }

module.exports = { enqueue, tickOnce, startWorker, stopWorker, TYPES }
