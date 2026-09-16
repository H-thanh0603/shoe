// Merchant insights — "AI chủ động phát hiện, không chờ admin hỏi".
// Thuần SQL read-only trên dữ liệu shop thật: briefing sáng, anomaly,
// forecast hết hàng, audit catalog, review intel. Trả số + evidence,
// KHÔNG tự hành động (hành động = agent_changes đã có + duyệt tay).
'use strict'

const pool = require('../../db.js')

const vnd = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫'

// ——— Daily briefing: doanh thu/đơn hôm nay vs trung bình 14 ngày + tồn thấp + pending già + review xấu ———
async function briefing() {
  const { rows: [t] } = await pool.query(
    `SELECT COALESCE(SUM(total_vnd) FILTER (WHERE status IN ('paid','shipped','done')), 0) AS revenue,
            COUNT(*) FILTER (WHERE status IN ('paid','shipped','done')) AS orders
     FROM orders WHERE created_at >= CURRENT_DATE`)
  const { rows: [avg] } = await pool.query(
    `SELECT COALESCE(AVG(d.revenue), 0) AS revenue, COALESCE(AVG(d.orders), 0) AS orders FROM (
       SELECT CURRENT_DATE - g AS day,
         (SELECT COALESCE(SUM(total_vnd), 0) FROM orders
           WHERE status IN ('paid','shipped','done') AND created_at::date = CURRENT_DATE - g) AS revenue,
         (SELECT COUNT(*) FROM orders
           WHERE status IN ('paid','shipped','done') AND created_at::date = CURRENT_DATE - g) AS orders
       FROM generate_series(1, 14) g) d`)
  const { rows: [low] } = await pool.query(
    'SELECT COUNT(*) AS n FROM product_variants WHERE stock <= 3')
  const { rows: [stale] } = await pool.query(
    `SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' AND created_at < now() - interval '48 hours'`)
  const { rows: [neg] } = await pool.query(
    `SELECT COUNT(*) AS n FROM reviews WHERE rating <= 2 AND created_at > now() - interval '7 days'`)
  const pct = (cur, base) => (base > 0 ? Math.round(((cur - base) / base) * 100) : (cur > 0 ? 100 : 0))
  const revPct = pct(Number(t.revenue), Number(avg.revenue))
  const ordPct = pct(Number(t.orders), Number(avg.orders))
  const lines = [
    `💰 Hôm nay: ${vnd(t.revenue)} (${revPct >= 0 ? '+' : ''}${revPct}% vs TB 14 ngày), ${t.orders} đơn (${ordPct >= 0 ? '+' : ''}${ordPct}%)`,
    `📦 ${low.n} variant tồn ≤ 3`,
    `🛒 ${stale.n} đơn pending quá 48h`,
    `⭐ ${neg.n} review ≤ 2★ trong 7 ngày`,
  ]
  return {
    today: { revenue: Number(t.revenue), orders: Number(t.orders) },
    avg14: { revenue: Math.round(Number(avg.revenue)), orders: Math.round(Number(avg.orders)) },
    lowStock: Number(low.n), stalePending: Number(stale.n), negReviews: Number(neg.n),
    lines,
  }
}

// ——— Anomaly: đơn hôm nay lệch >30% vs TB 14 ngày → drill nguyên nhân ———
async function anomaly() {
  const { rows: [t] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('paid','shipped','done')) AS orders,
            COALESCE(SUM(total_vnd) FILTER (WHERE status IN ('paid','shipped','done')), 0) AS revenue
     FROM orders WHERE created_at >= CURRENT_DATE`)
  const { rows: [avg] } = await pool.query(
    `SELECT COALESCE(AVG(d.orders), 0) AS orders FROM (
       SELECT (SELECT COUNT(*) FROM orders
         WHERE status IN ('paid','shipped','done') AND created_at::date = CURRENT_DATE - g) AS orders
       FROM generate_series(1, 14) g) d`)
  const base = Number(avg.orders)
  const cur = Number(t.orders)
  const drop = base > 0 ? Math.round(((base - cur) / base) * 100) : 0
  if (base < 3 || drop < 30) {
    return { anomaly: false, todayOrders: cur, avg14: Math.round(base), note: 'Đơn hôm nay trong ngưỡng bình thường (±30% vs TB 14 ngày).' }
  }
  // drill: pending già? hết hàng top-view? payment fail?
  const { rows: [stale] } = await pool.query(
    `SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' AND created_at >= CURRENT_DATE`)
  const { rows: oos } = await pool.query(
    `SELECT p.name FROM products p
     WHERE p.is_active AND NOT EXISTS
       (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock > 0)
     LIMIT 5`)
  const { rows: [payFail] } = await pool.query(
    `SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'failed' AND created_at >= CURRENT_DATE - interval '3 days'`)
  const causes = []
  if (Number(stale.n) > 0) causes.push(`${stale.n} đơn pending hôm nay (khách chưa thanh toán / chờ xử lý)`)
  if (oos.length) causes.push(`hết hàng: ${oos.map((r) => r.name).join(', ')}`)
  if (Number(payFail.n) > 0) causes.push(`${payFail.n} đơn lỗi thanh toán 3 ngày qua`)
  if (!causes.length) causes.push('chưa thấy nguyên nhân rõ trong tồn kho/thanh toán — kiểm tra traffic & campaign')
  return {
    anomaly: true, todayOrders: cur, avg14: Math.round(base), dropPct: drop,
    revenue: Number(t.revenue),
    likelyCauses: causes,
    line: `⚠️ Đơn hôm nay ${cur}, giảm ${drop}% vs TB 14 ngày (${Math.round(base)}). Nguyên nhân có thể: ${causes.join('; ')}.`,
  }
}

// ——— Forecast hết hàng: bán 14 ngày / tồn hiện tại → số ngày còn lại ———
async function forecast({ days = 7 } = {}) {
  const { rows } = await pool.query(
    `SELECT p.slug, p.name, pv.size, pv.stock,
            COALESCE((SELECT SUM(oi.qty) FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              JOIN product_variants pv2 ON pv2.id = oi.variant_id
              WHERE pv2.product_id = p.id AND pv2.size = pv.size
                AND o.status IN ('paid','shipped','done')
                AND o.created_at > now() - interval '14 days'), 0) AS sold14
     FROM product_variants pv JOIN products p ON p.id = pv.product_id
     WHERE p.is_active AND pv.stock > 0`)
  const crit = []
  for (const r of rows) {
    const sold = Number(r.sold14)
    if (sold <= 0) continue
    const daysLeft = Math.floor((Number(r.stock) / sold) * 14)
    if (daysLeft <= Number(days)) {
      crit.push({
        slug: r.slug, name: r.name, size: r.size, stock: r.stock,
        sold14: sold, daysLeft,
        suggestQty: Math.max(sold * 2 - Number(r.stock), 0), // nhập đủ ~28 ngày
      })
    }
  }
  crit.sort((a, b) => a.daysLeft - b.daysLeft)
  return {
    horizonDays: Number(days),
    critical: crit.slice(0, 20),
    line: crit.length
      ? `🔴 ${crit.length} variant có thể hết trong ${days} ngày (bán nhanh nhất: ${crit[0].name} size ${crit[0].size} còn ~${crit[0].daysLeft} ngày).`
      : `Không variant nào có nguy cơ hết trong ${days} ngày tới (theo tốc độ bán 14 ngày).`,
  }
}

// ——— Audit catalog: thiếu mô tả/ảnh/DNA, giá bất thường, thiếu SEO ———
async function catalogAudit() {
  const { rows: [c] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE description IS NULL OR description = '') AS no_desc,
            COUNT(*) FILTER (WHERE purpose IS NULL) AS no_purpose,
            COUNT(*) FILTER (WHERE perf IS NULL) AS no_dna,
            COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id)) AS no_image,
            COUNT(*) FILTER (WHERE price_vnd < 500000 OR price_vnd > 10000000) AS odd_price,
            COUNT(*) AS total
     FROM products WHERE is_active`)
  const issues = []
  if (Number(c.no_desc)) issues.push(`${c.no_desc} SP thiếu mô tả`)
  if (Number(c.no_image)) issues.push(`${c.no_image} SP thiếu ảnh`)
  if (Number(c.no_purpose)) issues.push(`${c.no_purpose} SP thiếu purpose (recommend kém)`)
  if (Number(c.no_dna)) issues.push(`${c.no_dna} SP thiếu điểm DNA`)
  if (Number(c.odd_price)) issues.push(`${c.odd_price} SP giá bất thường (<500k hoặc >10tr)`)
  return {
    total: Number(c.total),
    issues: {
      noDesc: Number(c.no_desc), noImage: Number(c.no_image),
      noPurpose: Number(c.no_purpose), noDna: Number(c.no_dna), oddPrice: Number(c.odd_price),
    },
    line: issues.length ? `Catalog: ${issues.join('; ')}.` : 'Catalog sạch — không có vấn đề.',
  }
}

// ——— Review intel: phân bố sao 30 ngày + top phàn nàn (keyword thô) ———
async function reviewIntel() {
  const { rows: dist } = await pool.query(
    `SELECT rating, COUNT(*) AS n FROM reviews
     WHERE created_at > now() - interval '30 days' GROUP BY rating ORDER BY rating DESC`)
  const total = dist.reduce((s, r) => s + Number(r.n), 0)
  const { rows: negs } = await pool.query(
    `SELECT r.content, p.name FROM reviews r LEFT JOIN products p ON p.id = r.product_id
     WHERE r.rating <= 2 AND r.created_at > now() - interval '30 days' AND r.content IS NOT NULL
     ORDER BY r.created_at DESC LIMIT 20`)
  const KW = { size: ['size', 'chật', 'rộng', 'kích'], ship: ['ship', 'giao', 'vận chuyển'], pack: ['đóng gói', 'hộp', 'bao bì'], quality: ['keo', 'đế', 'rách', 'hỏng', 'chất lượng'] }
  const topics = { size: 0, ship: 0, pack: 0, quality: 0, other: 0 }
  for (const r of negs) {
    const t = (r.content || '').toLowerCase()
    const hit = Object.entries(KW).find(([, kws]) => kws.some((k) => t.includes(k)))
    topics[hit ? hit[0] : 'other'] += 1
  }
  return {
    total30d: total,
    dist: Object.fromEntries(dist.map((r) => [r.rating, Number(r.n)])),
    negTopics: topics,
    negSamples: negs.slice(0, 5).map((r) => ({ product: r.name, content: (r.content || '').slice(0, 120) })),
    line: total
      ? `Review 30 ngày: ${total} bài; ${negs.length} chê (size ${topics.size}, ship ${topics.ship}, gói ${topics.pack}, chất lượng ${topics.quality}).`
      : 'Chưa có review 30 ngày qua.',
  }
}

// ——— Why drill: doanh thu kỳ này vs kỳ trước → bóc orders/conversion/AOV/sản phẩm ———
async function whyRevenue({ days = 7 } = {}) {
  const D = Number(days) || 7
  const q = (ago) => pool.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('paid','shipped','done')) AS orders,
            COALESCE(SUM(total_vnd) FILTER (WHERE status IN ('paid','shipped','done')), 0) AS revenue
     FROM orders WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
       AND created_at < CURRENT_DATE - ($2 || ' days')::interval`, [ago + days, ago])
  const [{ rows: [cur] }, { rows: [prev] }] = await Promise.all([q(0), q(D)])
  const pct = (c, b) => (b > 0 ? Math.round(((c - b) / b) * 100) : 0)
  const revP = pct(Number(cur.revenue), Number(prev.revenue))
  const ordP = pct(Number(cur.orders), Number(prev.orders))
  const aovC = cur.orders > 0 ? Math.round(cur.revenue / cur.orders) : 0
  const aovP = prev.orders > 0 ? Math.round(prev.revenue / prev.orders) : 0
  // top rớt: sản phẩm bán kỳ trước mà kỳ này bán kém
  const { rows: drops } = await pool.query(
    `WITH cur AS (SELECT oi.name_snapshot AS name, SUM(oi.qty) AS q FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ('paid','shipped','done') AND o.created_at >= CURRENT_DATE - ($1 || ' days')::interval
        GROUP BY 1),
      prv AS (SELECT oi.name_snapshot AS name, SUM(oi.qty) AS q FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ('paid','shipped','done')
          AND o.created_at >= CURRENT_DATE - ($2 || ' days')::interval
          AND o.created_at < CURRENT_DATE - ($1 || ' days')::interval
        GROUP BY 1)
     SELECT p.name, p.q AS prev_q, COALESCE(c.q, 0) AS cur_q
     FROM prv p LEFT JOIN cur c ON c.name = p.name
     WHERE COALESCE(c.q, 0) < p.q ORDER BY (p.q - COALESCE(c.q, 0)) DESC LIMIT 3`, [D, D * 2])
  return {
    days: Number(days),
    cur: { revenue: Number(cur.revenue), orders: Number(cur.orders), aov: aovC },
    prev: { revenue: Number(prev.revenue), orders: Number(prev.orders), aov: aovP },
    revPct: revP, ordPct: ordP,
    topDrops: drops.map((r) => ({ name: r.name, prevQty: Number(r.prev_q), curQty: Number(r.cur_q) })),
    line: `Doanh thu ${D} ngày: ${vnd(cur.revenue)} (${revP >= 0 ? '+' : ''}${revP}%), `
      + `${cur.orders} đơn (${ordP >= 0 ? '+' : ''}${ordP}%), AOV ${vnd(aovC)}`
      + (drops.length ? `; rớt mạnh: ${drops.map((r) => `${r.name} (${r.prev_q}→${r.cur_q})`).join(', ')}.` : '.'),
  }
}

module.exports = { briefing, anomaly, forecast, catalogAudit, reviewIntel, whyRevenue }
