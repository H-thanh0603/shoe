// Admin API (§39, §67-71) — requireRole('admin').
// Product: soft archive (is_active toggle, không hard delete khi có order — §68).
// Order: state transition validate + cancel release inventory (§54-55).
// Inventory: restock/adjust + inventory_transactions (§69).
// Analytics: aggregate đơn (§71).
const express = require('express')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { requireRole } = require('../middleware/auth.js')
const { z } = require('zod')

const router = express.Router()
router.use(requireRole('admin'))

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })
const bad = (res, code, message, status = 400) => res.status(status).json({ success: false, error: { code, message } })

// transitions hợp lệ (§70): mỗi step validate, không nhảy tùy ý
const NEXT = { pending: ['paid', 'cancelled'], paid: ['shipped', 'cancelled'], shipped: ['done', 'cancelled'], done: [], cancelled: [] }

// ——— Orders ———
router.get('/orders', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const status = req.query.status
  const where = status ? 'WHERE o.status = $3' : ''
  const args = status ? [limit, (page - 1) * limit, status] : [limit, (page - 1) * limit]
  const { rows } = await pool.query(
    `SELECT o.id, o.ref_code, o.user_id, o.status, o.payment_status, o.total_vnd, o.customer_name, o.created_at,
            (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o ${where} ORDER BY o.id DESC LIMIT $1 OFFSET $2`, args)
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM orders o ${where}`, status ? [status] : [])
  ok(res, rows, { page, limit, total: Number(count), totalPages: Math.ceil(count / limit) })
})

router.get('/orders/:id', async (req, res) => {
  const { rows: [o] } = await pool.query(
    `SELECT o.*, (SELECT json_agg(json_build_object('variantId', oi.variant_id, 'qty', oi.qty, 'unitPriceVnd', oi.unit_price_vnd, 'name', oi.name_snapshot, 'size', oi.size_snapshot))
      FROM order_items oi WHERE oi.order_id = o.id) AS items FROM orders o WHERE o.id = $1`, [req.params.id])
  if (!o) return bad(res, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng', 404)
  ok(res, o)
})

// PATCH /orders/:id — body {status} — transition validate (§70)
router.patch('/orders/:id', validate(z.object({ status: z.enum(['pending', 'paid', 'shipped', 'done', 'cancelled']) })), async (req, res) => {
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

router.get('/products', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, (SELECT COALESCE(SUM(stock), 0) FROM product_variants pv WHERE pv.product_id = p.id) AS total_stock
     FROM products p ORDER BY p.id DESC`)
  ok(res, rows)
})

router.post('/products', validate(productBody), async (req, res) => {
  const b = req.body
  const { rows: [p] } = await pool.query(
    `INSERT INTO products (name, slug, brand, description, price_vnd, colors, tag, collection_id, purpose)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.name, b.slug, b.brand, b.description || '', b.priceVnd, JSON.stringify(b.colors), b.tag ?? null, b.collectionId ?? null, b.purpose ?? null])
  res.status(201).json({ success: true, data: p })
})

router.patch('/products/:id', validate(productBody.partial()), async (req, res) => {
  const b = req.body
  const { rows: [p] } = await pool.query(
    `UPDATE products SET name = COALESCE($2, name), slug = COALESCE($3, slug), brand = COALESCE($4, brand),
       description = COALESCE($5, description), price_vnd = COALESCE($6, price_vnd), tag = $7,
       collection_id = $8, purpose = $9
     WHERE id = $1 RETURNING *`,
    [req.params.id, b.name, b.slug, b.brand, b.description, b.priceVnd, b.tag ?? null, b.collectionId ?? null, b.purpose ?? null])
  if (!p) return bad(res, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm', 404)
  ok(res, p)
})

// archive / restore — soft delete (§68)
router.patch('/products/:id/archive', (req, res, next) => setActive(req, res, next, false))
router.patch('/products/:id/restore', (req, res, next) => setActive(req, res, next, true))
function setActive(req, res, _next, isActive) {
  pool.query('UPDATE products SET is_active = $2 WHERE id = $1 RETURNING id, slug, is_active', [req.params.id, isActive])
    .then(({ rows: [p] }) => p
      ? ok(res, p)
      : bad(res, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm', 404))
    .catch(() => bad(res, 'INVALID_INPUT', 'id không hợp lệ'))
}

// ——— Inventory (§69): restock/adjust + bắt buộc InventoryTransaction ———
router.post('/inventory', validate(z.object({
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
    res.status(201).json({ success: true, data: { variantId, stock: after } })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(e.status || 500).json({ success: false, error: { code: e.code || 'INTERNAL', message: e.message } })
  } finally { client.release() }
})

// ——— Analytics (§71): revenue, orders, AOV, top products, low stock ———
router.get('/analytics', async (_req, res) => {
  const { rows: [summary] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status != 'cancelled') AS orders,
            COALESCE(SUM(total_vnd) FILTER (WHERE status != 'cancelled'), 0) AS revenue,
            COALESCE(ROUND(AVG(total_vnd) FILTER (WHERE status != 'cancelled')), 0) AS aov,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending
     FROM orders`)
  const { rows: top } = await pool.query(
    `SELECT oi.name_snapshot AS name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.unit_price_vnd) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled' GROUP BY oi.name_snapshot ORDER BY revenue DESC LIMIT 5`)
  const { rows: lowStock } = await pool.query(
    'SELECT pv.id, pv.size, pv.stock, p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.stock <= 3 ORDER BY pv.stock LIMIT 10')
  const { rows: [customers] } = await pool.query('SELECT COUNT(*) AS total FROM users')
  ok(res, {
    orders: Number(summary.orders), revenue: Number(summary.revenue), aov: Number(summary.aov),
    pendingOrders: Number(summary.pending), customers: Number(customers.total),
    topProducts: top, lowStock,
  })
})

module.exports = router
