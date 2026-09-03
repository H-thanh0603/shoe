-- 005: reviews (§36) + wishlist (§34)
-- Review: 1 user / product, verified = user_id có order chứa product đó
CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content    TEXT NOT NULL DEFAULT '',
  verified   BOOLEAN NOT NULL DEFAULT false,   -- Verified Purchase
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- Wishlist: đơn giản hóa 1 bảng thay vì Wishlist + WishlistItem (§04 tương đương)
CREATE TABLE IF NOT EXISTS wishlist_items (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)   -- không duplicate (§19)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);
