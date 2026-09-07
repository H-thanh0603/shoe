// GET /api/v1/live/feed — feed cộng đồng REAL từ DB (thay social-proof mock).
// Nguồn (mới nhất trước, ghép + sort + cắt 1 lần):
//  - orders (24h): "X vừa đặt NAME (size N)" — chỉ hiện tên + tỉnh/TP (cắt sau dấu phẩy), KHÔNG địa chỉ đầy đủ, không email/phone (§IDOR)
//  - reviews (24h): "X đánh giá N sao cho NAME: 'trích 60 ký tự'"
//  - product_events (6h, view/cart_add): "Có người đang xem NAME" (đếm session distinct)
//  - inventory_transactions (24h, SALE): "NAME vừa chạm ngưỡng tồn thấp" (badge khan hàng)
// Trace cụm nhỏ: sau ghép chỉ còn <=30 dòng — đủ cho UI, không lộ pattern mua bán.
const express = require('express')
const pool = require('../db.js')
const { cacheGet } = require('../middleware/cache.js')

const router = express.Router()

const firstName = (name) => String(name || '').trim().split(/\s+/).slice(-1).join(' ') || 'Khách'
const city = (addr) => {
  const parts = String(addr || '').split(',')
  return (parts[parts.length - 1] || '').trim().slice(0, 40)
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

router.get('/feed',
  cacheGet('live', 20, () => 'feed'),
  async (_req, res) => {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000)
    const since6h = new Date(Date.now() - 6 * 3600 * 1000)

    const [orders, reviews, views, stock] = await Promise.all([
      pool.query(
        `SELECT COALESCE(NULLIF(oi.name_snapshot, ''), p.name) AS name,
                oi.size_snapshot AS size, o.customer_name, o.shipping_address, o.created_at
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         JOIN product_variants pv ON pv.id = oi.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE o.created_at > $1 ORDER BY o.created_at DESC LIMIT 10`,
        [since24h],
      ),
      pool.query(
        `SELECT r.rating, r.content, r.created_at, u.name AS user_name, p.name AS product_name
         FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
         WHERE r.created_at > $1 ORDER BY r.created_at DESC LIMIT 10`,
        [since24h],
      ),
      // GOM theo (product, session): N người thật đang xem, không đếm mỗi request view 1 lần
      pool.query(
        `SELECT p.name AS product_name, COUNT(DISTINCT e.session_token) AS watchers
         FROM product_events e JOIN products p ON p.id = e.product_id
         WHERE e.type = 'view' AND e.created_at > $1
         GROUP BY p.name HAVING COUNT(DISTINCT e.session_token) >= 2
         ORDER BY watchers DESC LIMIT 6`,
        [since6h],
      ),
      pool.query(
        `SELECT p.name AS product_name, it.created_at, SUM(it.qty) AS sold
         FROM inventory_transactions it JOIN product_variants pv ON pv.id = it.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE it.type = 'SALE' AND it.created_at > $1
         GROUP BY p.name, it.created_at HAVING SUM(it.qty) >= 3
         ORDER BY it.created_at DESC LIMIT 6`,
        [since24h],
      ),
    ])

    const feed = [
      ...orders.rows.map((o) => ({
        kind: 'order',
        text: `${firstName(o.customer_name)} · ${city(o.shipping_address)} vừa đặt ${o.name}${o.size ? ` (size ${o.size})` : ''}`,
        at: o.created_at,
      })),
      ...reviews.rows.map((r) => ({
        kind: 'review',
        text: `${firstName(r.user_name)} đánh giá ${r.rating}★ ${r.product_name}${r.content ? `: “${clip(r.content, 60)}”` : ''}`,
        at: r.created_at,
      })),
      ...views.rows.map((v) => ({
        kind: 'viewers',
        text: `${v.watchers} người đang xem ${v.product_name}`,
        at: new Date(),
      })),
      ...stock.rows.map((s) => ({
        kind: 'stock',
        text: `${s.product_name} vừa bán ${s.sold} đôi — khan hàng`,
        at: s.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 30)
      .map(({ kind, text, at }) => ({ kind, text, at }))

    res.json({ success: true, data: { items: feed } })
  },
)

module.exports = router
