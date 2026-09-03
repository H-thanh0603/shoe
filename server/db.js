// node:sqlite (Node 26 built-in) — tự tạo schema + seed lần đầu chạy.
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')

const db = new DatabaseSync(path.join(__dirname, 'dev.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    priceVnd INTEGER NOT NULL,
    colors TEXT NOT NULL,        -- JSON array hex
    tag TEXT,                    -- NEW | LIMITED | SALE | null
    span TEXT                    -- wide | tall | null
  );
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    desc TEXT NOT NULL,
    bg TEXT NOT NULL,
    invert INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS drops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    pairs INTEGER NOT NULL,
    endsAt TEXT NOT NULL,        -- ISO 8601
    active INTEGER NOT NULL DEFAULT 1
  );
`)

// seed nếu trống
const seed = () => {
  if (db.prepare('SELECT COUNT(*) n FROM products').get().n > 0) return

  const cols = [
    ['street-future', 'STREET FUTURE', 'Dark. Metallic. Urban.', 'charcoal', 0],
    ['night-runner', 'NIGHT RUNNER', 'Black. Neon accent. Motion blur.', 'deep', 0],
    ['raw-motion', 'RAW MOTION', 'Minimal. White. Editorial.', 'paper', 1],
    ['city-heat', 'CITY HEAT', 'Concrete. Red accent. High energy.', 'accent', 0],
  ]
  const insC = db.prepare('INSERT INTO collections (slug, name, desc, bg, invert) VALUES (?,?,?,?,?)')
  cols.forEach((c) => insC.run(...c))

  const prods = [
    ['air-vector-01', 'AIR VECTOR 01', 'KINETIC', 4190000, '["#0a0a0a","#e8e6e1","#d43a2a"]', 'NEW', 'wide'],
    ['run-wild-pro', 'RUN WILD PRO', 'KINETIC', 3850000, '["#1c1c1e","#d43a2a"]', null, 'tall'],
    ['street-flow', 'STREET FLOW', 'KINETIC LAB', 2990000, '["#e8e6e1","#0a0a0a","#8a8a8f"]', null, null],
    ['night-pulse', 'NIGHT PULSE', 'KINETIC', 3450000, '["#0a0a0a","#d43a2a","#e8e6e1"]', 'LIMITED', null],
    ['concrete-90', 'CONCRETE 90', 'KINETIC LAB', 2750000, '["#8a8a8f","#0a0a0a"]', 'SALE', 'tall'],
    ['hyper-drive-x', 'HYPER DRIVE X', 'KINETIC', 4650000, '["#d43a2a","#0a0a0a","#e8e6e1"]', null, null],
  ]
  const insP = db.prepare('INSERT INTO products (slug, name, brand, priceVnd, colors, tag, span) VALUES (?,?,?,?,?,?,?)')
  prods.forEach((p) => insP.run(...p))

  // drop active kết thúc +72h kể từ lần seed đầu
  db.prepare('INSERT INTO drops (name, slug, pairs, endsAt) VALUES (?,?,?,?)').run(
    'AIR VECTOR 01', 'air-vector-01', 120,
    new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  )
}
seed()

module.exports = db
