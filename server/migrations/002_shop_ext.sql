-- 002: inventory transactions + coupons + orders mở rộng (BACKEND.md §15, §27, §20)

CREATE TABLE inventory_transactions (
  id         SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  qty        INTEGER NOT NULL,
  before_qty INTEGER NOT NULL,
  after_qty  INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('RESTOCK','SALE','RELEASE','RETURN','ADJUSTMENT')),
  reference_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_txn_variant ON inventory_transactions(variant_id);

CREATE TABLE coupons (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL CHECK (type IN ('PERCENTAGE','FIXED','FREE_SHIPPING')),
  value            INTEGER NOT NULL CHECK (value > 0),
  minimum_order_vnd INTEGER NOT NULL DEFAULT 0,
  usage_limit      INTEGER,
  per_user_limit   INTEGER NOT NULL DEFAULT 1,
  starts_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coupon_usages (
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  order_id  INTEGER NOT NULL REFERENCES orders(id),
  user_id   INTEGER,
  used_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coupon_id, order_id)
);

ALTER TABLE orders
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  ADD COLUMN shipping_fee_vnd INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN discount_vnd INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN coupon_id INTEGER REFERENCES coupons(id);
