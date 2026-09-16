-- 019: rollup doanh thu theo ngày — dashboard đọc 1 bảng nhỏ thay vì full scan orders.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day DATE PRIMARY KEY,
  orders INT NOT NULL DEFAULT 0,
  revenue BIGINT NOT NULL DEFAULT 0,
  pending INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
