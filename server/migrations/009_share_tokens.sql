-- 009: token chia sẻ giỏ riêng — single-use, hết hạn 24h.
-- Thay vì lộ session_token (sống 30 ngày), link #/gio-hang/:token dùng token này.
CREATE TABLE IF NOT EXISTS cart_share_tokens (
  token      TEXT PRIMARY KEY,
  cart_id    INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  used       BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_cart ON cart_share_tokens(cart_id);
