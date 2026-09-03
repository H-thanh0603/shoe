// Seed data shop. Idempotent: chỉ chèn khi bảng trống.
// Usage: npm run db:seed
const bcrypt = require('bcryptjs')
const pool = require('./db.js')

const SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45]

async function main() {
  const { rows: c0 } = await pool.query('SELECT COUNT(*) n FROM collections')
  if (c0[0].n > 0) { console.log('seed đã chạy — bỏ qua'); return }

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

  const prods = [
    ['air-vector-01', 'AIR VECTOR 01', 'KINETIC', 'Upper dệt kỹ thuật một mảnh, đế polyurethane phản quang. Ứng suất phân bổ đều theo bước chân — chạy phố, đứng cả ngày.', 4190000, '["#0a0a0a","#e8e6e1","#d43a2a"]', 'NEW', 'wide', 1],
    ['run-wild-pro', 'RUN WILD PRO', 'KINETIC', 'Đệm nitrogen midsole, drop 8mm. Trả năng lượng mỗi bước. Cho tempo chạy nhanh trên nhựa đường.', 3850000, '["#1c1c1e","#d43a2a"]', null, 'tall', 1],
    ['street-flow', 'STREET FLOW', 'KINETIC LAB', 'Silhouette thấp, da full-grain, đường may lộ chủ đích. Sneaker mặc hằng ngày của outfit tối giản.', 2990000, '["#e8e6e1","#0a0a0a","#8a8a8f"]', null, null, 3],
    ['night-pulse', 'NIGHT PULSE', 'KINETIC', 'Chi tiết phản sáng 3M khắp upper, đệm gel gót. Biển hiệu cho đêm.', 3450000, '["#0a0a0a","#d43a2a","#e8e6e1"]', 'LIMITED', null, 2],
    ['concrete-90', 'CONCRETE 90', 'KINETIC LAB', 'Lấy cảm hứng giày chạy đường dài thập niên 90: suede, đế gồ, tone xám bê tông.', 2750000, '["#8a8a8f","#0a0a0a"]', 'SALE', 'tall', 4],
    ['hyper-drive-x', 'HYPER DRIVE X', 'KINETIC', 'Plate carbon nhẹ, đệm dual-density. Mẫu nhanh nhất dòng KINETIC.', 4650000, '["#d43a2a","#0a0a0a","#e8e6e1"]', null, null, 1],
  ]
  for (const p of prods) {
    await pool.query(
      `INSERT INTO products (slug, name, brand, description, price_vnd, colors, tag, span, collection_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      p,
    )
  }

  // variants: mỗi product × SIZES, stock giả 3–15, vài size hết hàng
  const { rows: all } = await pool.query('SELECT id FROM products ORDER BY id')
  for (const [pi, prod] of all.entries()) {
    for (const [si, size] of SIZES.entries()) {
      const isOut = (pi + si) % 7 === 3            // 1-2 size hết hàng mỗi product
      const base = size >= 40 && size <= 42 ? 12 : 6  // size phổ biến nhiều hàng
      const stock = isOut ? 0 : base + ((pi * 3 + si) % 4)
      await pool.query(
        'INSERT INTO product_variants (product_id, size, stock) VALUES ($1,$2,$3)',
        [prod.id, size, stock],
      )
    }
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

  console.log(`seed ok — 6 products, ${all.length * SIZES.length} variants, admin@kinetic.vn`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())
