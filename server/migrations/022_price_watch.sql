-- 022: price history + watchlist (price intelligence + proactive).
-- price_history: append mỗi khi admin đổi giá (không update-in-place).
-- watchlist: khách đăng ký theo dõi (slug+size, mục tiêu giá hoặc có hàng).
--   channel hiện chỉ mail (địa chỉ lúc đăng ký); consent = chính hành động đăng ký,
--   bỏ theo dõi = DELETE.
CREATE TABLE IF NOT EXISTS price_history (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_vnd  INT NOT NULL,
  changed_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  size        INT,
  target_vnd  INT, -- báo khi giá <= target; NULL = chỉ báo có hàng
  notified_at TIMESTAMPTZ, -- chống spam: báo 1 lần / đợt
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, slug, size)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_slug ON watchlist(slug);
