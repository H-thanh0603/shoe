// Data-access cho catalog — route chỉ gọi service, không viết SQL inline.
const pool = require('../db.js')
const { httpError } = require('../middleware/errorHandler.js')

const fmtPrice = (vnd) => vnd.toLocaleString('vi-VN') + '₫'
const mapProduct = (p) => ({ ...p, colors: JSON.parse(p.colors), tags: JSON.parse(p.tags || '[]'), price: fmtPrice(p.price_vnd) })

// ảnh sản phẩm (bảng product_images): 1 query cho nhiều product, gộp theo id
async function attachImages(items) {
  if (!items.length) return items
  const { rows } = await pool.query(
    'SELECT product_id, url FROM product_images WHERE product_id = ANY($1) ORDER BY sort',
    [items.map((p) => p.id)],
  )
  const byId = {}
  for (const r of rows) (byId[r.product_id] ??= []).push(r.url)
  return items.map((p) => ({ ...p, images: byId[p.id] || [] }))
}

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
  const items = await attachImages(rows.map(mapProduct))
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
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
  const [detail] = await attachImages([mapProduct(rows[0])])
  return { ...detail, variants }
}

// Ảnh review: data-URL (jpeg/png/webp), tối đa 3 ảnh, mỗi ảnh ~500KB.
// Không cần object storage; đủ cho shop nhỏ, validate kỹ phía server.
const MAX_IMAGES = 3
const MAX_IMAGE_CHARS = 700_000
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

function checkImages(images) {
  if (!Array.isArray(images)) throw httpError(400, 'INVALID_INPUT', 'images phải là mảng')
  if (images.length > MAX_IMAGES) throw httpError(400, 'TOO_MANY_IMAGES', `Tối đa ${MAX_IMAGES} ảnh`)
  for (const img of images) {
    if (typeof img !== 'string' || !IMAGE_RE.test(img) || img.length > MAX_IMAGE_CHARS) {
      throw httpError(400, 'INVALID_IMAGE', 'Ảnh phải là JPG/PNG/WebP dưới ~500KB')
    }
  }
  return images
}

async function listReviews(slug, viewerId) {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active', [slug])
  if (!p) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm')
  const { rows } = await pool.query(
    `SELECT r.id, r.rating, r.content, r.verified, r.images, r.helpful_count, r.created_at, u.name AS user_name
      ${viewerId ? ', EXISTS(SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.user_id = $2) AS voted' : ''}
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 ORDER BY r.helpful_count DESC, r.created_at DESC LIMIT 50`,
    viewerId ? [p.id, viewerId] : [p.id],
  )
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0
  return { items: rows, avgRating: Math.round(avg * 10) / 10, count: rows.length }
}

async function createReview(slug, userId, { rating, content, images = [] }) {
  const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active', [slug])
  if (!p) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm')

  const { rows: [dup] } = await pool.query('SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2', [p.id, userId])
  if (dup) throw httpError(409, 'REVIEW_EXISTS', 'Bạn đã đánh giá sản phẩm này')
  checkImages(images)

  // verified: user có order (không cancelled) chứa product này
  const { rows: [ord] } = await pool.query(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)
       AND o.user_id = $2 AND o.status != 'cancelled' LIMIT 1`,
    [p.id, userId],
  )

  const { rows: [r] } = await pool.query(
    'INSERT INTO reviews (product_id, user_id, rating, content, images, verified) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, rating, content, images, helpful_count, verified, created_at',
    [p.id, userId, rating, content || '', JSON.stringify(images), !!ord],
  )
  return r
}

// Toggle vote "hữu ích" — mỗi user 1 vote/review, trả count + trạng thái mới
async function toggleHelpful(reviewId, userId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [r] } = await client.query('SELECT id FROM reviews WHERE id = $1', [reviewId])
    if (!r) throw httpError(404, 'REVIEW_NOT_FOUND', 'Không tìm thấy đánh giá')
    const { rows: [v] } = await client.query(
      'SELECT id FROM review_votes WHERE review_id = $1 AND user_id = $2', [reviewId, userId])
    let voted
    if (v) {
      await client.query('DELETE FROM review_votes WHERE id = $1', [v.id])
      await client.query('UPDATE reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = $1', [reviewId])
      voted = false
    } else {
      await client.query('INSERT INTO review_votes (review_id, user_id) VALUES ($1,$2)', [reviewId, userId])
      await client.query('UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1', [reviewId])
      voted = true
    }
    const { rows: [{ helpful_count }] } = await client.query('SELECT helpful_count FROM reviews WHERE id = $1', [reviewId])
    await client.query('COMMIT')
    return { helpfulCount: helpful_count, voted }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

module.exports = { listProducts, getProductDetail, listReviews, createReview, toggleHelpful }
