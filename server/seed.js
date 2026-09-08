// Seed data shop. Idempotent: chỉ chèn khi bảng trống.
// Usage: npm run db:seed
require('dotenv').config()
const bcrypt = require('bcryptjs')
const pool = require('./db.js')

const SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45]

// [slug, name, brand, description, price_vnd, colors(JSON), tag, span, collection_id,
//  purpose, perf, comfort, style, durability, daily, tags(JSON)]
const PRODS = [
  // --- KINETIC (5) — brand nhà
  ['air-vector-01', 'AIR VECTOR 01', 'KINETIC', 'Upper dệt kỹ thuật một mảnh, đế polyurethane phản quang. Ứng suất phân bổ đều theo bước chân — chạy phố, đứng cả ngày.', 4190000, '["#0a0a0a","#e8e6e1","#d43a2a"]', 'NEW', 'wide', 1, 'running', 90, 82, 72, 84, 88, '["reflective","breathable"]'],
  ['run-wild-pro', 'RUN WILD PRO', 'KINETIC', 'Đệm nitrogen midsole, drop 8mm. Trả năng lượng mỗi bước. Cho tempo chạy nhanh trên nhựa đường.', 3850000, '["#1c1c1e","#d43a2a"]', null, 'tall', 1, 'running', 93, 76, 65, 78, 70, '["breathable"]'],
  ['street-flow', 'STREET FLOW', 'KINETIC', 'Silhouette thấp, da full-grain, đường may lộ chủ đích. Sneaker mặc hằng ngày của outfit tối giản.', 2990000, '["#e8e6e1","#0a0a0a","#8a8a8f"]', null, null, 3, 'daily', 62, 88, 92, 85, 95, '[]'],
  ['night-pulse', 'NIGHT PULSE', 'KINETIC', 'Chi tiết phản sáng 3M khắp upper, đệm gel gót. Biển hiệu cho đêm.', 3450000, '["#0a0a0a","#d43a2a","#e8e6e1"]', 'LIMITED', null, 2, 'street', 70, 74, 95, 75, 80, '["reflective"]'],
  ['hyper-drive-x', 'HYPER DRIVE X', 'KINETIC', 'Plate carbon nhẹ, đệm dual-density. Mẫu nhanh nhất dòng KINETIC.', 4650000, '["#d43a2a","#0a0a0a","#e8e6e1"]', null, null, 1, 'running', 97, 70, 68, 72, 60, '[]'],

  // --- Nike (5)
  ['pegasus-41', 'NIKE PEGASUS 41', 'NIKE', 'Workhorse chạy đường dài: ReactX foam trả năng lượng, upper Air Mesh thoáng cả mùa hè.', 3690000, '["#0a0a0a","#e8e6e1","#1a5fb4"]', null, 'tall', 1, 'running', 91, 90, 74, 85, 90, '["breathable"]'],
  ['vomero-18', 'NIKE VOMERO 18', 'NIKE', 'Đệm ZoomX dày nhất dòng — êm tối đa cho km dài và ngày phục hồi.', 4590000, '["#e8e6e1","#8a8a8f","#0a0a0a"]', 'NEW', null, 1, 'running', 84, 97, 70, 80, 85, '["breathable"]'],
  ['court-vision', 'NIKE COURT VISION LOW', 'NIKE', 'Lấy từ giày bóng rổ thập niên 80: da sạch, mũi giày vuông, đi gì cũng hợp.', 2190000, '["#e8e6e1","#0a0a0a"]', null, null, 3, 'daily', 55, 78, 88, 90, 92, '[]'],
  ['infinity-rn-4', 'NIKE INFINITY RN 4', 'NIKE', 'Chạy ổn định: đệm rộng, chống lật cổ chân — cho người mới chạy.', 3390000, '["#8a8a8f","#e8e6e1","#1c1c1e"]', null, 'wide', 1, 'running', 80, 92, 65, 86, 88, '["breathable"]'],
  ['blazer-mid', 'NIKE BLAZER MID 77', 'NIKE', 'Cổ giữa retro, da vintage crease tự nhiên — statement cho outfit street.', 2690000, '["#e8e6e1","#d43a2a","#0a0a0a"]', null, null, 3, 'street', 50, 70, 94, 82, 75, '[]'],

  // --- Adidas (5)
  ['ultraboost-5', 'ADIDAS ULTRABOOST 5', 'ADIDAS', 'Boost full-length + Primeknit ôm như tất. Sneaker chạy sang trọng nhất tủ.', 5490000, '["#0a0a0a","#e8e6e1"]', 'NEW', 'tall', 1, 'running', 88, 95, 85, 78, 82, '["breathable"]'],
  ['samba-og', 'ADIDAS SAMBA OG', 'ADIDAS', 'Huyền thoại sân cỏ thành icon street: mũi giày T, đế gum thanh lịch.', 2390000, '["#e8e6e1","#0a0a0a","#d9a441"]', null, null, 3, 'street', 48, 72, 96, 88, 90, '[]'],
  ['gazelle-indoor', 'ADIDAS GAZELLE INDOOR', 'ADIDAS', 'Silhouette mỏng, suede màu bold — đồ chơi của tín đồ phối đồ.', 2490000, '["#1a5fb4","#e8e6e1"]', null, null, 3, 'street', 45, 70, 93, 84, 85, '[]'],
  ['dame-9', 'ADIDAS DAME 9', 'ADIDAS', 'Giày bóng rổ thi đấu thật: grip mạnh, lockdown chặt, phản ứng nhanh cú nhảy.', 2990000, '["#0a0a0a","#d43a2a"]', null, 'wide', 4, 'court', 89, 74, 78, 85, 55, '[]'],
  ['terrex-free-hiker', 'ADIDAS TERREX FREE HIKER', 'ADIDAS', 'Gore-Tex chặn nước, đế Continental bám đá ướt. Trail all-weather.', 5790000, '["#4a5d3a","#0a0a0a","#8a8a8f"]', 'LIMITED', null, 2, 'trail', 82, 84, 70, 97, 65, '["water-resistant","gore-tex"]'],

  // --- New Balance (4)
  ['990v6', 'NEW BALANCE 990V6', 'NEW BALANCE', 'Made in USA, suede mesh kết hợp, FuelCell êm — dad shoe đỉnh cao craft.', 5290000, '["#8a8a8f","#e8e6e1","#0a0a0a"]', null, 'tall', 3, 'daily', 66, 93, 90, 94, 96, '[]'],
  ['550-white', 'NEW BALANCE 550', 'NEW BALANCE', 'Basketball cổ điển 1989 trở lại: da trắng sạch, chữ N to, dễ phối nhất tủ.', 2590000, '["#e8e6e1","#d9a441","#0a0a0a"]', 'SALE', null, 3, 'street', 50, 74, 95, 88, 92, '[]'],
  ['fresh-foam-more-v5', 'NB FRESH FOAM MORE V5', 'NEW BALANCE', 'Đệm tối đa Fresh Foam X — cho km cuối vẫn êm như km đầu.', 3990000, '["#0a0a0a","#e8e6e1","#d43a2a"]', null, null, 1, 'running', 82, 96, 70, 84, 86, '["breathable"]'],
  ['hiero-v1', 'NB HIERO V1', 'NEW BALANCE', 'Trail chạy núi: đế VIBRAM, đá tựa gót, hộp mũi rộng cho ngón dài.', 4290000, '["#d9a441","#0a0a0a","#8a8a8f"]', null, null, 2, 'trail', 90, 80, 62, 95, 60, '["water-resistant"]'],

  // --- Asics (4)
  ['gel-nimbus-26', 'ASICS GEL-NIMBUS 26', 'ASICS', 'Nimbus êm nhất phân khúc: FF BLAST Turbo + GEL visible gót. Cho gót chân sợ sốc.', 4690000, '["#e8e6e1","#1a5fb4","#0a0a0a"]', null, 'wide', 1, 'running', 80, 98, 72, 82, 88, '["breathable"]'],
  ['gel-kayano-31', 'ASICS GEL-KAYANO 31', 'ASICS', 'Chạy chống sụp vòm: 4D GUIDANCE SYSTEM dẫn bước tự nhiên, đệm ổn định mới.', 4290000, '["#0a0a0a","#d43a2a","#8a8a8f"]', null, null, 1, 'running', 84, 93, 68, 88, 85, '["breathable"]'],
  ['gt-2160', 'ASICS GT-2160', 'ASICS', 'Retro-runner Y2K comeback: vòm mắt giày thẳng, gradient màu, đế chỉnh hình.', 2590000, '["#e8e6e1","#8a8a8f","#1a5fb4"]', null, null, 3, 'street', 60, 84, 91, 86, 88, '[]'],
  ['gel-fuji-trabuco', 'ASICS GEL-FUJI TRABUCO 13', 'ASICS', 'Trail kỹ thuật: plate chống đá, đế ASICSGRIP, mũi phủ chống va.', 3690000, '["#4a5d3a","#d43a2a","#0a0a0a"]', null, null, 2, 'trail', 92, 82, 58, 98, 55, '["water-resistant","breathable"]'],

  // --- Puma (3)
  ['deviate-nitro-3', 'PUMA DEVIATE NITRO 3', 'PUMA', 'NITRO Elite carbon plate — giá tốt nhất trong nhóm giày plate tốc độ.', 4490000, '["#0a0a0a","#d43a2a","#e8e6e1"]', null, 'tall', 1, 'running', 96, 78, 74, 75, 62, '["breathable"]'],
  ['suede-classic', 'PUMA SUEDE CLASSIC', 'PUMA', 'Suede 1968: biểu tượng breakdance, dáng mỏng gọn, màu bão hòa.', 1890000, '["#d43a2a","#e8e6e1","#0a0a0a"]', 'SALE', null, 3, 'street', 40, 68, 90, 80, 87, '[]'],
  ['mb-lo', 'PUMA MB.01 LOW', 'PUMA', 'Chữ ký LaMelo Ball: nhẹ featherweight, đế explosive, style sáng sân.', 3090000, '["#d9a441","#1a5fb4","#e8e6e1"]', null, null, 4, 'court', 88, 72, 92, 78, 50, '[]'],
]

// Users mẫu + reviews cho social proof. verified = user có order chứa product
// (cùng logic createReview). [email, name, [[product_slug, rating, content], ...]]
const REVIEWERS = [
  ['minh@kinetic.vn', 'Minh Anh', [
    ['air-vector-01', 5, 'Đi 2 tuần rồi — êm thật, chi tiết phản quang lên rất rõ lúc chạy đêm. Size chuẩn, mình 42 hay đi là 42.'],
    ['hyper-drive-x', 4, 'Nhanh nhẹ đúng quảng cáo, nhưng đế cứng hơn mong đợi. Chạy tempo thì tuyệt.'],
  ]],
  ['bao@kinetic.vn', 'Quốc Bảo', [
    ['night-pulse', 5, 'Mua để chạy tối, reflective dính đèn xe đẹp. Gel gót đỡ đau gót thật.'],
    ['gel-kayano-31', 5, 'Chạy 300km, vòm chân không mỏi như đôi cũ. Đáng tiền.'],
  ]],
  ['lan@kinetic.vn', 'Lan Chi', [
    ['street-flow', 4, 'Da đẹp, đường may chắc. Đi làm 8 tiếng không cấn. Trừ 1 sao vì hơi nóng mùa hè.'],
    ['samba-og', 5, 'Phối với đồ gì cũng đẹp, đầu tư xứng đáng. Nhớ lên nửa size nếu mang tất dày.'],
  ]],
  ['tuan@kinetic.vn', 'Tuấn Kiệt', [
    ['ultraboost-5', 5, 'Boost thật sự khác — êm như đi trên mây. Giá cao nhưng đáng.'],
    ['550-white', 4, 'Dễ phối nhất tủ. Da hơi dễ bẩn nhưng lau là sạch.'],
  ]],
]

async function seedReviews() {
  const { rows: [r0] } = await pool.query('SELECT COUNT(*) n FROM reviews')
  if (r0.n > 0) { console.log('reviews đã có — bỏ qua'); return }
  const hash = bcrypt.hashSync('kinetic123', 10)
  let count = 0
  for (const [email, name, reviews] of REVIEWERS) {
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1,$2,'customer',$3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [email, hash, name],
    )
    // mỗi reviewer đặt 1 đơn delivered chứa đôi đầu → verified badge dựa order thật
    const { rows: [first] } = await pool.query('SELECT id, price_vnd FROM products WHERE slug = $1', [reviews[0][0]])
    if (first) {
      const { rows: [v] } = await pool.query('SELECT id FROM product_variants WHERE product_id = $1 AND stock > 0 LIMIT 1', [first.id])
      if (v) {
        const { rows: [o] } = await pool.query(
          `INSERT INTO orders (ref_code, user_id, status, total_vnd, customer_name, customer_phone, customer_email, shipping_address, payment_method, payment_status)
           VALUES ($1,$2,'delivered',$3,$4,'0900000000',$5,'Hà Nội','cod','paid') RETURNING id`,
          [`SEED-RV-${u.id}`, u.id, first.price_vnd, name, email],
        )
        await pool.query(
          'INSERT INTO order_items (order_id, variant_id, qty, unit_price_vnd, name_snapshot, size_snapshot) SELECT $1, id, 1, $2, $3, size FROM product_variants WHERE id = $4',
          [o.id, first.price_vnd, name, v.id],
        )
      }
    }
    for (const [slug, rating, content] of reviews) {
      const { rows: [p] } = await pool.query('SELECT id FROM products WHERE slug = $1', [slug])
      if (!p) continue
      // verified tính lại theo order thật của user (chỉ đôi đầu có đơn)
      const { rows: [ord] } = await pool.query(
        `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)
           AND o.user_id = $2 AND o.status != 'cancelled' LIMIT 1`,
        [p.id, u.id],
      )
      await pool.query(
        `INSERT INTO reviews (product_id, user_id, rating, content, verified, helpful_count, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() - ($7 || ' days')::interval)
         ON CONFLICT (product_id, user_id) DO NOTHING`,
        [p.id, u.id, rating, content, !!ord, Math.floor(Math.random() * 9), Math.floor(Math.random() * 20)],
      )
      count++
    }
  }
  console.log(`reviews ok — ${count} bài`)
}

async function main() {
  const { rows: c0 } = await pool.query('SELECT COUNT(*) n FROM collections')
  if (c0[0].n > 0) {
    console.log('seed đã chạy — bỏ qua catalog')
    await seedReviews()
    return
  }

  const cols = [
    ['street-future', 'STREET FUTURE', 'Dark. Metallic. Urban.', 'charcoal', false],
    ['night-runner', 'NIGHT RUNNER', 'Black. Neon accent. Motion blur.', 'deep', false],
    ['raw-motion', 'RAW MOTION', 'Minimal. White. Editorial.', 'paper', true],
    ['city-heat', 'CITY HEAT', 'Concrete. Red accent. High energy.', 'accent', false],
  ]
  for (const c of cols) {
    await pool.query(
      'INSERT INTO collections (slug, name, "desc", bg, invert) VALUES ($1,$2,$3,$4,$5)',
      c,
    )
  }

  for (const p of PRODS) {
    await pool.query(
      `INSERT INTO products (slug, name, brand, description, price_vnd, colors, tag, span, collection_id,
                              purpose, perf, comfort, style, durability, daily, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      p,
    )
  }

  // variants: mỗi product × SIZES — batch 1 query/sp qua unnest
  const { rows: all } = await pool.query('SELECT id FROM products ORDER BY id')
  for (const [pi, prod] of all.entries()) {
    const stocks = SIZES.map((_s, si) => {
      const isOut = (pi + si) % 7 === 3            // 1-2 size hết hàng mỗi product
      const base = SIZES[si] >= 40 && SIZES[si] <= 42 ? 12 : 6  // size phổ biến nhiều hàng
      return isOut ? 0 : base + ((pi * 3 + si) % 4)
    })
    await pool.query(
      `INSERT INTO product_variants (product_id, size, stock)
       SELECT $1, s, st FROM unnest($2::int[], $3::int[]) AS t(s, st)`,
      [prod.id, SIZES, stocks],
    )
  }

  // drop active +72h
  await pool.query(
    'INSERT INTO drops (name, slug, pairs, ends_at) VALUES ($1,$2,$3,$4)',
    ['AIR VECTOR 01', 'air-vector-01', 120, new Date(Date.now() + 72 * 3600 * 1000)],
  )

  // admin mặc định: admin@kinetic.vn / kinetic-admin
  const hash = bcrypt.hashSync('kinetic-admin', 10)
  await pool.query(
    `INSERT INTO users (email, password_hash, role, name) VALUES ($1,$2,'admin','Admin')
     ON CONFLICT (email) DO NOTHING`,
    ['admin@kinetic.vn', hash],
  )

  // coupon mẫu để test checkout + validate realtime
  await pool.query(
    `INSERT INTO coupons (code, type, value, minimum_order_vnd, usage_limit, expires_at)
     VALUES ('WELCOME10','PERCENTAGE',10,0,1000, now() + interval '90 days'),
            ('FREESHIP','FREE_SHIPPING',1,0,1000, now() + interval '90 days')
     ON CONFLICT (code) DO NOTHING`,
  )

  console.log(`seed ok — ${all.length} products, ${all.length * SIZES.length} variants, admin@kinetic.vn`)
  await seedReviews()
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())
