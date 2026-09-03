-- 003: order snapshot (§21) + idempotency (§26)
ALTER TABLE orders
  ADD COLUMN idempotency_key TEXT UNIQUE;

ALTER TABLE order_items
  ADD COLUMN name_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN size_snapshot INTEGER;
