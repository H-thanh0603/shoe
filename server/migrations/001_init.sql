-- 001_init.sql — schema Shopping Core. Chạy bởi migrate.js.
CREATE TABLE IF NOT EXISTS collections (
  id     SERIAL PRIMARY KEY,
  slug   TEXT UNIQUE NOT NULL,
  name   TEXT NOT NULL,
  "desc" TEXT NOT NULL,
  bg     TEXT NOT NULL,
  invert BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  brand         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price_vnd     INTEGER NOT NULL CHECK (price_vnd > 0),
  colors        TEXT NOT NULL,                -- JSON array hex (display)
  tag           TEXT,                        -- NEW | LIMITED | SALE | null
  span          TEXT,                        -- grid layout hint
  collection_id INT REFERENCES collections(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

CREATE TABLE IF NOT EXISTS product_variants (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       INT NOT NULL CHECK (size BETWEEN 30 AND 50),
  stock      INT NOT NULL CHECK (stock >= 0) DEFAULT 0,
  UNIQUE (product_id, size)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  color_hex  TEXT,
  sort       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- user | admin
  name          TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id),
  session_token TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         SERIAL PRIMARY KEY,
  cart_id    INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INT NOT NULL REFERENCES product_variants(id),
  qty        INT NOT NULL CHECK (qty > 0),
  UNIQUE (cart_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  ref_code         TEXT UNIQUE NOT NULL,
  user_id          INT REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|paid|shipped|done|cancelled
  total_vnd        INTEGER NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  payment_method   TEXT NOT NULL,                    -- vnpay|cod
  payment_txn_ref  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id             SERIAL PRIMARY KEY,
  order_id       INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id     INT NOT NULL REFERENCES product_variants(id),
  qty            INT NOT NULL CHECK (qty > 0),
  unit_price_vnd INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drops (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  slug    TEXT NOT NULL,
  pairs   INT NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  active  BOOLEAN NOT NULL DEFAULT true
);
