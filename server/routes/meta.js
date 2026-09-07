// GET /api/v1/collections, GET /api/v1/drop, GET /sitemap.xml — meta (§41 envelope)
// Đọc nhiều/gần như tĩnh → cache 5 phút.
const express = require('express')
const pool = require('../db.js')
const { cacheGet } = require('../middleware/cache.js')

const router = express.Router()

router.get('/collections', cacheGet('meta', 300, () => 'collections'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM collections ORDER BY id')
  res.json({ success: true, data: rows })
})

router.get('/drop', cacheGet('meta', 300, () => 'drop'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM drops WHERE active ORDER BY id DESC LIMIT 1')
  if (!rows[0]) return res.status(404).json({ success: false, error: { code: 'DROP_NOT_FOUND', message: 'Không có drop nào active' } })
  res.json({ success: true, data: rows[0] })
})

// Sitemap động cho SEO — cache HTTP header đủ (bot kéo thưa), không cần cache app.
// ponytail: hash URL SEO giới hạn — chuyển sang History API route khi cần SEO thật sâu.
async function renderSitemap(req, res) {
  const base = `${req.protocol}://${req.get('host')}`
  const [{ rows: products }, { rows: collections }] = await Promise.all([
    pool.query(`SELECT slug, created_at FROM products WHERE is_active ORDER BY id`),
    pool.query(`SELECT slug FROM collections ORDER BY id`),
  ])
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/#/shop`, priority: '0.9' },
    { loc: `${base}/#/new`, priority: '0.8' },
    { loc: `${base}/#/bo-suu-tap`, priority: '0.7' },
    ...collections.map((c) => ({ loc: `${base}/#/bo-suu-tap/${c.slug}`, priority: '0.6' })),
    ...products.map((p) => ({
      loc: `${base}/#/san-pham/${p.slug}`, priority: '0.8', lastmod: p.created_at.toISOString().slice(0, 10),
    })),
  ]
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`,
  )
}

router.get('/sitemap.xml', renderSitemap)

module.exports = router
module.exports.renderSitemap = renderSitemap
