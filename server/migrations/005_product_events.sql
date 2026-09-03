-- Bước 7.7 — events tracking: nền cho adaptive behavior sau
CREATE TABLE product_events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('view','cart_add','quiz_complete','secret_mode')),
  product_id INTEGER REFERENCES products(id),
  user_id INTEGER REFERENCES users(id),
  session_token TEXT,  -- cookie guest, không FK carts
  meta TEXT,           -- JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_type_product ON product_events(type, product_id);
-- ponytail: no retention — DELETE >90 ngày khi bảng phình
