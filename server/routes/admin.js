// Admin API (§39, §67-71) — requireRole('admin').
// Product: soft archive (is_active toggle, không hard delete khi có order — §68).
// Order: state transition validate + cancel release inventory (§54-55).
// Inventory: restock/adjust + inventory_transactions (§69).
// Analytics: aggregate đơn (§71).
const express = require('express')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { requireAuth, loadPerms, requirePerm, bustPerms } = require('../middleware/auth.js')
const { bust, cacheGet } = require('../middleware/cache.js')
const { audit } = require('../services/audit.js')
const { z } = require('zod')

const router = express.Router()
// RBAC: mọi route admin cần login + load quyền; từng route tự khai requirePerm.
// users.role='admin' bypass hết (superuser). Thứ tự: requirePerm TRƯỚC cacheGet
// để user thiếu quyền không bao giờ đọc được cache của người có quyền.
router.use(requireAuth, loadPerms)

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })
const bad = (res, code, message, status = 400) => res.status(status).json({ success: false, error: { code, message } })

// transitions hợp lệ (§70): mỗi step validate, không nhảy tùy ý
const NEXT = { pending: ['paid', 'cancelled'], paid: ['shipped', 'cancelled'], shipped: ['done', 'cancelled'], done: [], cancelled: [] }

// ——— Orders ———
router.get('/orders', requirePerm('orders:read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const status = req.query.status
  const args = status ? [limit, (page - 1) * limit, status] : [limit, (page - 1) * limit]
  const where = status ? 'WHERE o.status = $3' : ''
  const whereCount = status ? 'WHERE o.status = $1' : ''
  const { rows } = await pool.query(
    `SELECT o.id, o.ref_code, o.user_id, o.status, o.payment_status, o.total_vnd, o.customer_name, o.created_at,
            (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o ${where} ORDER BY o.id DESC LIMIT $1 OFFSET $2`, args)
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM orders o ${whereCount}`, status ? [status] : [])
  ok(res, rows, { page, limit, total: Number(count), totalPages: Math.ceil(count / limit) })
})

router.get('/orders/:id', requirePerm('orders:read'), async (req, res) => {
  const { rows: [o] } = await pool.query(
    `SELECT o.*, (SELECT json_agg(json_build_object('variantId', oi.variant_id, 'qty', oi.qty, 'unitPriceVnd', oi.unit_price_vnd, 'name', oi.name_snapshot, 'size', oi.size_snapshot))
      FROM order_items oi WHERE oi.order_id = o.id) AS items FROM orders o WHERE o.id = $1`, [req.params.id])
  if (!o) return bad(res, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng', 404)
  ok(res, o)
})

// PATCH /orders/:id — body {status} — transition validate (§70)
router.patch('/orders/:id', requirePerm('orders:write'), validate(z.object({ status: z.enum(['pending', 'paid', 'shipped', 'done', 'cancelled']) })), async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [o] } = await client.query('SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE', [req.params.id])
    if (!o) { await client.query('ROLLBACK'); return bad(res, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng', 404) }
    const next = req.body.status
    if (!NEXT[o.status]?.includes(next)) {
      await client.query('ROLLBACK')
      return bad(res, 'INVALID_TRANSITION', `Không thể chuyển ${o.status} → ${next}`, 409)
    }

    // cancel: hoàn stock + log inventory transaction (§54 không chỉ status=CANCELLED)
    if (next === 'cancelled') {
      const { rows: items } = await client.query(
        'SELECT variant_id, qty FROM order_items WHERE order_id = $1', [o.id])
      for (const it of items) {
        const { rows: [v] } = await client.query(
          'UPDATE product_variants SET stock = stock + $1 WHERE id = $2 RETURNING stock', [it.qty, it.variant_id])
        await client.query(
          'INSERT INTO inventory_transactions (variant_id, qty, before_qty, after_qty, type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
          [it.variant_id, it.qty, v.stock - it.qty, v.stock, 'RESTOCK', o.id])
      }
    }

    const paymentStatus = next === 'paid' ? 'paid' : o.payment_status
    await client.query('UPDATE orders SET status = $1, payment_status = $2 WHERE id = $3', [next, paymentStatus, o.id])
    await client.query('COMMIT')
    await bust('products:detail', 'admin:analytics') // stock + số dashboard đổi theo trạng thái đơn
    await audit(req, 'order.transition', 'order', o.id, { from: o.status, to: next })
    ok(res, { id: o.id, status: next })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(e.status || 500).json({ success: false, error: { code: e.code || 'INTERNAL', message: e.message } })
  } finally { client.release() }
})

// ——— Products (§68: CRUD + archive/restore, không hard delete) ———
const productBody = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  brand: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  priceVnd: z.number().int().positive(),
  colors: z.array(z.string()).min(1),
  tag: z.enum(['NEW', 'LIMITED', 'SALE']).nullable().optional(),
  collectionId: z.number().int().positive().nullable().optional(),
  purpose: z.enum(['running', 'street', 'court', 'daily', 'trail']).nullable().optional(),
})

router.get('/products', requirePerm('products:read'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, (SELECT COALESCE(SUM(stock), 0) FROM product_variants pv WHERE pv.product_id = p.id) AS total_stock
     FROM products p ORDER BY p.id DESC`)
  ok(res, rows)
})

const variantInput = z.object({ size: z.number().int().min(30).max(50), stock: z.number().int().min(0).max(10000) })

// POST tạo sản phẩm KÈM variants — không variants thì không bán được nên
// form admin luôn gửi sizes; thiếu = 400 rõ ràng thay vì tạo hàng chết
router.post('/products', requirePerm('products:write'), validate(productBody.extend({ variants: z.array(variantInput).min(1).max(20) })), async (req, res) => {
  const b = req.body
  const sizes = b.variants.map((v) => v.size)
  if (new Set(sizes).size !== sizes.length) return bad(res, 'DUPLICATE_SIZE', 'Size trùng nhau', 400)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [p] } = await client.query(
      `INSERT INTO products (name, slug, brand, description, price_vnd, colors, tag, collection_id, purpose)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.name, b.slug, b.brand, b.description || '', b.priceVnd, JSON.stringify(b.colors), b.tag ?? null, b.collectionId ?? null, b.purpose ?? null])
    const { rows: variants } = await client.query(
      `INSERT INTO product_variants (product_id, size, stock)
       SELECT $1, s, st FROM unnest($2::int[], $3::int[]) AS t(s, st) RETURNING id, size, stock`,
      [p.id, b.variants.map((v) => v.size), b.variants.map((v) => v.stock)])
    for (const v of variants) {
      await client.query(
        'INSERT INTO inventory_transactions (variant_id, qty, before_qty, after_qty, type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [v.id, v.stock, 0, v.stock, 'RESTOCK', null])
    }
    await client.query('COMMIT')
    await bust('products:list', 'products:detail')
    await audit(req, 'product.create', 'product', p.id, { slug: p.slug, name: p.name })
    res.status(201).json({ success: true, data: { ...p, variants } })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    if (e.code === '23505') return bad(res, 'SLUG_EXISTS', 'Slug đã tồn tại', 409)
    throw e
  } finally {
    client.release()
  }
})

router.patch('/products/:id', requirePerm('products:write'), validate(productBody.partial()), async (req, res) => {
  const b = req.body
  const { rows: [p] } = await pool.query(
    `UPDATE products SET name = COALESCE($2, name), slug = COALESCE($3, slug), brand = COALESCE($4, brand),
       description = COALESCE($5, description), price_vnd = COALESCE($6, price_vnd), tag = $7,
       collection_id = $8, purpose = $9
     WHERE id = $1 RETURNING *`,
    [req.params.id, b.name, b.slug, b.brand, b.description, b.priceVnd, b.tag ?? null, b.collectionId ?? null, b.purpose ?? null])
  if (!p) return bad(res, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm', 404)
  await bust('products:list', 'products:detail')
  await audit(req, 'product.update', 'product', p.id, { fields: Object.keys(b) })
  ok(res, p)
})

// archive / restore — soft delete (§68)
router.patch('/products/:id/archive', requirePerm('products:write'), (req, res, next) => setActive(req, res, next, false))
router.patch('/products/:id/restore', requirePerm('products:write'), (req, res, next) => setActive(req, res, next, true))
function setActive(req, res, _next, isActive) {
  pool.query('UPDATE products SET is_active = $2 WHERE id = $1 RETURNING id, slug, is_active', [req.params.id, isActive])
    .then(async ({ rows: [p] }) => {
      if (!p) return bad(res, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm', 404)
      await bust('products:list', 'products:detail')
      await audit(req, isActive ? 'product.restore' : 'product.archive', 'product', p.id, {})
      return ok(res, p)
    })
    .catch(() => bad(res, 'INVALID_INPUT', 'id không hợp lệ'))
}

// ——— Inventory (§69): restock/adjust + bắt buộc InventoryTransaction ———
router.post('/inventory', requirePerm('inventory:write'), validate(z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().refine((q) => q !== 0, 'Phải khác 0'),
})), async (req, res) => {
  const { variantId, qty } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [v] } = await client.query('SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE', [variantId])
    if (!v) throw Object.assign(new Error('Không tìm thấy variant'), { status: 404, code: 'VARIANT_NOT_FOUND' })
    const after = v.stock + qty
    if (after < 0) throw Object.assign(new Error(`Không đủ stock: hiện ${v.stock}, điều chỉnh ${qty}`), { status: 409, code: 'INSUFFICIENT_STOCK' })
    await client.query('UPDATE product_variants SET stock = $1 WHERE id = $2', [after, variantId])
    await client.query(
      'INSERT INTO inventory_transactions (variant_id, qty, before_qty, after_qty, type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [variantId, qty, v.stock, after, qty > 0 ? 'RESTOCK' : 'ADJUSTMENT', null])
    await client.query('COMMIT')
    await bust('products:detail')
    await audit(req, 'inventory.adjust', 'variant', variantId, { qty, after })
    res.status(201).json({ success: true, data: { variantId, stock: after } })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(e.status || 500).json({ success: false, error: { code: e.code || 'INTERNAL', message: e.message } })
  } finally { client.release() }
})

// ——— Analytics (§71): revenue, orders, AOV, top products, low stock ———
// Aggregate toàn bảng mỗi lần mở dashboard → cache 120s (private: số liệu nội bộ).
// Bust khi đơn đổi trạng thái (ảnh hưởng paid/pending) — xem PATCH /orders/:id.
const ANALYTICS_CC = { cacheControl: 'private, max-age=60' }
router.get('/analytics', requirePerm('analytics:read'), cacheGet('admin:analytics', 120, () => 'summary', ANALYTICS_CC), async (_req, res) => {
  // Doanh thu/đơn chỉ tính tiền thật (paid+) — pending chưa phải tiền về,
  // số dashboard sẽ thấp hơn trước nhưng đúng
  const { rows: [summary] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('paid','shipped','done')) AS orders,
            COALESCE(SUM(total_vnd) FILTER (WHERE status IN ('paid','shipped','done')), 0) AS revenue,
            COALESCE(ROUND(AVG(total_vnd) FILTER (WHERE status IN ('paid','shipped','done'))), 0) AS aov,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending
     FROM orders`)
  const { rows: top } = await pool.query(
    `SELECT oi.name_snapshot AS name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.unit_price_vnd) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ('paid','shipped','done') GROUP BY oi.name_snapshot ORDER BY revenue DESC LIMIT 5`)
  const { rows: lowStock } = await pool.query(
    'SELECT pv.id, pv.size, pv.stock, p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.stock <= 3 ORDER BY pv.stock LIMIT 10')
  const { rows: [customers] } = await pool.query('SELECT COUNT(*) AS total FROM users')
  ok(res, {
    orders: Number(summary.orders), revenue: Number(summary.revenue), aov: Number(summary.aov),
    pendingOrders: Number(summary.pending), customers: Number(customers.total),
    topProducts: top, lowStock,
  })
})

// ——— Coupons: list + tạo + bật/tắt ———
router.get('/coupons', requirePerm('coupons:read'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, COUNT(cu.order_id) AS used_count FROM coupons c
     LEFT JOIN coupon_usages cu ON cu.coupon_id = c.id
     GROUP BY c.id ORDER BY c.id DESC`)
  ok(res, rows)
})

const couponBody = z.object({
  code: z.string().trim().min(3).max(50),
  type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING']),
  value: z.number().int().positive(),
  minimumOrderVnd: z.number().int().min(0).optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

router.post('/coupons', requirePerm('coupons:write'), validate(couponBody), async (req, res) => {
  const b = req.body
  try {
    const { rows: [c] } = await pool.query(
      `INSERT INTO coupons (code, type, value, minimum_order_vnd, usage_limit, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.code.toUpperCase(), b.type, b.value, b.minimumOrderVnd ?? 0, b.usageLimit ?? null, b.expiresAt ?? null])
    await audit(req, 'coupon.create', 'coupon', c.id, { code: c.code })
    res.status(201).json({ success: true, data: c })
  } catch (e) {
    if (e.code === '23505') return bad(res, 'COUPON_EXISTS', 'Mã này đã tồn tại', 409)
    throw e
  }
})

router.patch('/coupons/:id', requirePerm('coupons:write'), validate(z.object({
  status: z.enum(['active', 'inactive']).optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})), async (req, res) => {
  const b = req.body
  const { rows: [c] } = await pool.query(
    `UPDATE coupons SET status = COALESCE($2, status), usage_limit = $3, expires_at = $4 WHERE id = $1 RETURNING *`,
    [req.params.id, b.status, b.usageLimit ?? null, b.expiresAt ?? null])
  if (!c) return bad(res, 'COUPON_NOT_FOUND', 'Không tìm thấy mã', 404)
  await audit(req, 'coupon.update', 'coupon', c.id, { fields: Object.keys(b) })
  ok(res, c)
})

// ——— Agent staged changes (persist thay RAM — restart không mất) ———
const changeBody = z.object({
  kind: z.enum(['listing_update', 'price_update', 'inventory_action', 'promotion', 'campaign']),
  status: z.enum(['staged', 'applied', 'discarded']).optional(),
  summary: z.string().max(200),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  notes: z.array(z.string()).optional(),
  createdBy: z.string().max(200).optional(),
  operator: z.string().max(200).optional(),
  appliedBy: z.string().max(200).nullable().optional(),
  discardedBy: z.string().max(200).nullable().optional(),
})

router.get('/agent-changes', requirePerm('agent:read'), async (req, res) => {
  const status = req.query.status
  const { rows } = await pool.query(
    `SELECT * FROM agent_changes ${status ? 'WHERE status = $1' : ''} ORDER BY created_at DESC LIMIT 100`,
    status ? [status] : [])
  ok(res, rows)
})

// upsert theo change_id — adapter ghi khi stage/apply/discard
router.put('/agent-changes/:id', requirePerm('agent:write'), validate(changeBody), async (req, res) => {
  const b = req.body
  const { rows: [c] } = await pool.query(
    `INSERT INTO agent_changes (change_id, kind, status, summary, items, payload, notes, created_by, operator, applied_by, discarded_by, updated_at)
     VALUES ($1,$2,COALESCE($3,'staged'),$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (change_id) DO UPDATE SET
       status = COALESCE(EXCLUDED.status, agent_changes.status),
       summary = EXCLUDED.summary, items = EXCLUDED.items, payload = EXCLUDED.payload,
       notes = EXCLUDED.notes, applied_by = EXCLUDED.applied_by,
       discarded_by = EXCLUDED.discarded_by, updated_at = now()
     RETURNING *`,
    [req.params.id, b.kind, b.status ?? null, b.summary, JSON.stringify(b.items ?? []),
     JSON.stringify(b.payload ?? {}), JSON.stringify(b.notes ?? []),
     b.createdBy ?? '', b.operator ?? '', b.appliedBy ?? null, b.discardedBy ?? null])
  ok(res, c)
})

// duyệt / gỡ duyệt — cần agent:write, approved_by = user id
router.post('/agent-changes/:id/approve', requirePerm('agent:write'), validate(z.object({ approved: z.boolean() })), async (req, res) => {
  const { rows: [c] } = await pool.query(
    `UPDATE agent_changes SET approved = $2, approved_by = CASE WHEN $2 THEN $3 ELSE NULL END,
      updated_at = now() WHERE change_id = $1 RETURNING *`,
    [req.params.id, req.body.approved, String(req.user.id)])
  if (!c) return bad(res, 'CHANGE_NOT_FOUND', 'Không tìm thấy change', 404)
  await audit(req, req.body.approved ? 'agent.approve' : 'agent.unapprove', 'agent_change', c.change_id, {})
  ok(res, c)
})

router.post('/agent-changes/:id/discard', requirePerm('agent:write'), async (req, res) => {
  const { rows: [c] } = await pool.query(
    `UPDATE agent_changes SET status = 'discarded', discarded_by = $2, updated_at = now()
     WHERE change_id = $1 RETURNING *`,
    [req.params.id, String(req.user.id)])
  if (!c) return bad(res, 'CHANGE_NOT_FOUND', 'Không tìm thấy change', 404)
  await audit(req, 'agent.discard', 'agent_change', c.change_id, {})
  ok(res, c)
})

// ——— Variants của 1 product (để admin xem/sửa stock) ———
router.get('/products/:id/variants', requirePerm('products:read'), async (req, res) => {
  const { rows: [p] } = await pool.query(
    'SELECT id FROM products WHERE id::text = $1 OR slug = $1', [req.params.id])
  if (!p) return bad(res, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm', 404)
  const { rows } = await pool.query(
    'SELECT pv.id, pv.size, pv.stock, p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.product_id = $1 ORDER BY pv.size',
    [p.id])
  ok(res, rows)
})

// ——— Series theo ngày (cho merchant agent query_metrics + chart) ———
router.get('/analytics/series', requirePerm('analytics:read'), cacheGet('admin:analytics', 120, (req) =>
  `series:${req.query.metric === 'orders' ? 'orders' : 'revenue'}:${Math.min(Math.max(Number(req.query.days) || 30, 1), 90)}`, ANALYTICS_CC), async (req, res) => {
  const metric = req.query.metric === 'orders' ? 'orders' : 'revenue'
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90)
  const { rows } = await pool.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(o.total_vnd) FILTER (WHERE o.status IN ('paid','shipped','done')), 0) AS revenue,
            COUNT(o.id) FILTER (WHERE o.status IN ('paid','shipped','done')) AS orders
     FROM generate_series(now() - ($1 || ' days')::interval, now(), '1 day') d
     LEFT JOIN orders o ON date_trunc('day', o.created_at) = date_trunc('day', d)
     GROUP BY d ORDER BY d`,
    [days],
  )
  ok(res, {
    metric,
    points: rows.map((r) => ({
      day: r.day,
      value: metric === 'orders' ? Number(r.orders) : Number(r.revenue),
    })),
  })
})

// ——— Behavioral analytics từ product_events (30 ngày) ———
router.get('/analytics/events', requirePerm('analytics:read'), cacheGet('admin:analytics', 120, () => 'events', ANALYTICS_CC), async (_req, res) => {
  const { rows: topViews } = await pool.query(
    `SELECT p.slug, p.name, COUNT(*) AS views,
            COUNT(*) FILTER (WHERE e.type = 'cart_add') AS carts
     FROM product_events e LEFT JOIN products p ON p.id = e.product_id
     WHERE e.created_at > now() - interval '30 days' AND e.product_id IS NOT NULL
     GROUP BY p.slug, p.name ORDER BY views DESC LIMIT 10`)
  const { rows: [funnel] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE type = 'view') AS views,
            COUNT(*) FILTER (WHERE type = 'cart_add') AS carts,
            COUNT(*) FILTER (WHERE type = 'quiz_complete') AS quizzes,
            COUNT(DISTINCT session_token) AS sessions
     FROM product_events WHERE created_at > now() - interval '30 days'`)
  ok(res, {
    topViews,
    funnel: {
      views: Number(funnel.views), carts: Number(funnel.carts),
      quizzes: Number(funnel.quizzes), sessions: Number(funnel.sessions),
      viewToCart: funnel.views > 0 ? Math.round((funnel.carts / funnel.views) * 1000) / 10 : 0,
    },
  })
})

// ——— Cache: xem hit-rate/backend + xóa tay khi cần (đa instance: cần Redis mới clear chung) ———
router.get('/cache', requirePerm('ops:manage'), async (_req, res) => {
  const cache = require('../services/cache.js')
  ok(res, cache.info())
})

router.delete('/cache', requirePerm('ops:manage'), async (req, res) => {
  const cache = require('../services/cache.js')
  await cache.del()
  await audit(req, 'ops.cache_clear', 'cache', '', {})
  ok(res, { cleared: true, ...cache.info() })
})

// ——— Jobs: quan sát + retry tay (hàng failed nằm lại để xử lý) ———
router.get('/jobs', requirePerm('ops:manage'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const status = req.query.status
  const args = status ? [limit, status] : [limit]
  const { rows } = await pool.query(
    `SELECT id, type, status, attempts, max_attempts, last_error, run_after, created_at, updated_at
     FROM jobs ${status ? 'WHERE status = $2' : ''} ORDER BY id DESC LIMIT $1`, args)
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM jobs ${status ? 'WHERE status = $1' : ''}`, status ? [status] : [])
  ok(res, rows, { total: Number(count) })
})

router.post('/jobs/:id/retry', requirePerm('ops:manage'), async (req, res) => {
  const { rows: [j] } = await pool.query(
    `UPDATE jobs SET status = 'pending', run_after = now(), updated_at = now()
     WHERE id = $1 AND status = 'failed' RETURNING id, type, status`, [req.params.id])
  if (!j) return bad(res, 'JOB_NOT_FOUND', 'Không tìm thấy job failed', 404)
  await audit(req, 'ops.job_retry', 'job', j.id, { type: j.type })
  ok(res, j)
})

// ——— RBAC: roles, gán vai trò, audit log (015) ———
// Danh sách roles kèm permissions + số thành viên
router.get('/roles', requirePerm('users:manage'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.description,
       COALESCE((SELECT json_agg(p.key ORDER BY p.key) FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = r.id), '[]') AS permissions,
       (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS members
     FROM roles r ORDER BY r.id`)
  ok(res, rows)
})

router.post('/roles', requirePerm('users:manage'), validate(z.object({
  name: z.string().regex(/^[a-z0-9-]{2,50}$/),
  description: z.string().max(200).optional(),
})), async (req, res) => {
  try {
    const { rows: [r] } = await pool.query(
      'INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING *',
      [req.body.name, req.body.description || ''])
    await audit(req, 'role.create', 'role', r.id, { name: r.name })
    res.status(201).json({ success: true, data: r })
  } catch (e) {
    if (e.code === '23505') return bad(res, 'ROLE_EXISTS', 'Role đã tồn tại', 409)
    throw e
  }
})

// Thay toàn bộ permissions của role (gửi mảng key, key lạ → 400)
router.put('/roles/:id/permissions', requirePerm('users:manage'), validate(z.object({
  permissionKeys: z.array(z.string()).max(50),
})), async (req, res) => {
  const { rows: [r] } = await pool.query('SELECT id, name FROM roles WHERE id = $1', [req.params.id])
  if (!r) return bad(res, 'ROLE_NOT_FOUND', 'Không tìm thấy role', 404)
  const { rows: known } = await pool.query('SELECT id, key FROM permissions WHERE key = ANY($1)', [req.body.permissionKeys])
  if (known.length !== new Set(req.body.permissionKeys).size) {
    return bad(res, 'UNKNOWN_PERMISSION', 'Có permission key không tồn tại', 400)
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [r.id])
    for (const p of known) {
      await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)', [r.id, p.id])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
  // quyền đổi → bust cache perms của mọi member (đơn giản: bust toàn namespace rbac)
  const { rows: members } = await pool.query('SELECT user_id FROM user_roles WHERE role_id = $1', [r.id])
  await Promise.all(members.map((m) => bustPerms(m.user_id)))
  await audit(req, 'role.permissions', 'role', r.id, { permissions: req.body.permissionKeys })
  ok(res, { id: r.id, permissions: req.body.permissionKeys })
})

router.delete('/roles/:id', requirePerm('users:manage'), async (req, res) => {
  const { rows: [m] } = await pool.query('SELECT user_id FROM user_roles WHERE role_id = $1 LIMIT 1', [req.params.id])
  if (m) return bad(res, 'ROLE_IN_USE', 'Role còn thành viên — gỡ hết member trước khi xóa', 409)
  const { rowCount } = await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id])
  if (!rowCount) return bad(res, 'ROLE_NOT_FOUND', 'Không tìm thấy role', 404)
  await audit(req, 'role.delete', 'role', req.params.id, {})
  ok(res, { ok: true })
})

router.get('/permissions', requirePerm('users:manage'), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, key, description FROM permissions ORDER BY key')
  ok(res, rows)
})

// Users kèm roles (để admin gán vai trò) — không trả password_hash
router.get('/users', requirePerm('users:manage'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const q = req.query.q?.trim()
  const where = q ? 'WHERE u.email ILIKE $3 OR u.name ILIKE $3' : ''
  const args = q ? [limit, (page - 1) * limit, `%${q.slice(0, 50)}%`] : [limit, (page - 1) * limit]
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at,
       COALESCE((SELECT json_agg(r.name) FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]') AS roles
     FROM users u ${where} ORDER BY u.id DESC LIMIT $1 OFFSET $2`, args)
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM users u ${q ? 'WHERE u.email ILIKE $1 OR u.name ILIKE $1' : ''}`,
    q ? [`%${q.slice(0, 50)}%`] : [])
  ok(res, rows, { page, limit, total: Number(count), totalPages: Math.ceil(count / limit) })
})

// Gán lại toàn bộ roles của user (mảng name). Cấm tự sửa chính mình (tránh tự khóa).
router.post('/users/:id/roles', requirePerm('users:manage'), validate(z.object({
  roleNames: z.array(z.string().regex(/^[a-z0-9-]{2,50}$/)).max(20),
})), async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return bad(res, 'SELF_EDIT', 'Không tự đổi vai trò của chính mình (tránh tự khóa)', 400)
  }
  const { rows: [u] } = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.params.id])
  if (!u) return bad(res, 'USER_NOT_FOUND', 'Không tìm thấy user', 404)
  const { rows: roles } = await pool.query('SELECT id, name FROM roles WHERE name = ANY($1)', [req.body.roleNames])
  if (roles.length !== new Set(req.body.roleNames).size) {
    return bad(res, 'UNKNOWN_ROLE', 'Có role không tồn tại', 400)
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [u.id])
    for (const r of roles) {
      await client.query('INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1,$2,$3)', [u.id, r.id, req.user.id])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
  await bustPerms(u.id)
  await audit(req, 'user.roles', 'user', u.id, { email: u.email, roles: req.body.roleNames })
  ok(res, { id: u.id, roles: req.body.roleNames })
})

// Audit log: lọc theo actor/action/entity, mới nhất trước
router.get('/audit-logs', requirePerm('audit:read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const conds = []
  const args = []
  if (req.query.actorId) { args.push(Number(req.query.actorId)); conds.push(`a.actor_id = $${args.length}`) }
  if (req.query.action) { args.push(req.query.action); conds.push(`a.action = $${args.length}`) }
  if (req.query.entity) { args.push(req.query.entity); conds.push(`a.entity = $${args.length}`) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  args.push(limit, (page - 1) * limit)
  const { rows } = await pool.query(
    `SELECT a.*, u.email AS actor_email FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ${where} ORDER BY a.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM audit_logs a ${where}`, args.slice(0, -2))
  ok(res, rows, { page, limit, total: Number(count), totalPages: Math.ceil(count / limit) })
})

module.exports = router
