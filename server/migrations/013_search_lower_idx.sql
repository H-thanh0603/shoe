-- 013: index trigram case-insensitive cho search (query dùng lower() cả 2 vế).
CREATE INDEX IF NOT EXISTS idx_products_name_lower_trgm ON products USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_lower_trgm ON products USING gin (lower(brand) gin_trgm_ops);
