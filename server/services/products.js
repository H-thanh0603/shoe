// Data-access cho catalog — route chỉ gọi service, không viết SQL inline.
const pool = require('../db.js')
const { httpError } = require('../middleware/errorHandler.js')

const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({ ...p, colors: JSON.parse(p.colors), tags: JSON.parse(p.tags || '[]'), price: fmtPrice(p.price_vnd) })

async function listProducts({ limit = 24, page = 1, q } = {}) {
  const where = q ? "is_active AND (name ILIKE $3 OR brand ILIKE $3)" : 'is_active'
  const likeArgs = q ? [`%${q}%`] : []
  // ponytail: ILIKE đủ cho catalog nhỏ; pg_trgm khi cần fuzzy + dataset lớn
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE ${where} ORDER BY id LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit, ...likeArgs],
  )
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM products WHERE ${q ? "is_active AND (name ILIKE $1 OR brand ILIKE $1)" : 'is_active'}`,
    likeArgs,
  )
  const total = Number(count)
  return { items: rows.map(mapProduct), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function getProductDetail(slug) {
  const { rows } = await pool.query(
    `SELECT p.*, c.slug AS collection_slug, c.name AS collection_name
     FROM products p LEFT JOIN collections c ON c.id = p.collection_id
     WHERE p.slug = $1 AND p.is_active`,
    [slug],
  )
  if (!rows[0]) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm')
  const { rows: variants } = await pool.query(
    'SELECT id, size, stock FROM product_variants WHERE product_id = $1 ORDER BY size',
    [rows[0].id],
  )
  return { ...mapProduct(rows[0]), variants }
}

async function listReviews(slug) {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active', [slug])
  if (!p) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm')
  const { rows } = await pool.query(
    `SELECT r.id, r.rating, r.content, r.verified, r.created_at, u.name AS user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
    [p.id],
  )
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0
  return { items: rows, avgRating: Math.round(avg * 10) / 10, count: rows.length }
}

async function createReview(slug, userId, { rating, content }) {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active', [slug])
  if (!p) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm')

  const { rows: [dup] } = await pool.query('SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2', [p.id, userId])
  if (dup) throw httpError(409, 'REVIEW_EXISTS', 'Bạn đã đánh giá sản phẩm này')

  // verified: user có order (không cancelled) chứa product này
  const { rows: [ord] } = await pool.query(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)
       AND o.user_id = $2 AND o.status != 'cancelled' LIMIT 1`,
    [p.id, userId],
  )

  const { rows: [r] } = await pool.query(
    'INSERT INTO reviews (product_id, user_id, rating, content, verified) VALUES ($1,$2,$3,$4,$5) RETURNING id, rating, content, verified, created_at',
    [p.id, userId, rating, content || '', !!ord],
  )
  return r
}

module.exports = { listProducts, getProductDetail, listReviews, createReview }
