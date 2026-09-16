-- 021: draft_order funnel — nối AI tạo giỏ → claim → paid.
-- cart_share_tokens.source_session: session agent nào tạo token ('' = share tay).
-- cart_share_tokens.claimed_at: khách nhận giỏ lúc nào (NULL = chưa nhận).
-- orders.source_session: đơn từ phiên AI nào ('' = không qua AI).
CREATE TABLE IF NOT EXISTS cart_share_tokens (
  token      TEXT PRIMARY KEY,
  cart_id    INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  used       BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cart_share_tokens ADD COLUMN IF NOT EXISTS source_session TEXT NOT NULL DEFAULT '';
ALTER TABLE cart_share_tokens ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_session TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orders_source_session ON orders(source_session) WHERE source_session <> '';
CREATE INDEX IF NOT EXISTS idx_share_tokens_session ON cart_share_tokens(source_session) WHERE source_session <> '';
