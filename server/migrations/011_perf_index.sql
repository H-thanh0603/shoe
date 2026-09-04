-- 011: index cho truy vấn nhanh + tìm kiếm fuzzy.
-- - pg_trgm: ILIKE '%q%' không dùng được btree → GIN trigram cho name/brand (+ slug).
-- - index FK còn thiếu: product_images, order_items, carts(user/session), coupons(code),
--   product_events(created), inventory_transactions(created), reviews(user).
-- Tất cả IF NOT EXISTS + CONCURRENTLY không dùng được trong migration transaction của
-- migrate.js (pool.query đơn) nên dùng CREATE INDEX thường — bảng hiện nhỏ, chạy nhanh.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- tìm kiếm: trigram GIN (đúng chính tả gần đúng vẫn ra) + btree cho sort/fill
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_slug_trgm ON products USING gin (slug gin_trgm_ops);

-- FK / lookup thiếu
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_session ON carts(session_token);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON product_events(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_txn_created ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON cart_items(variant_id);
