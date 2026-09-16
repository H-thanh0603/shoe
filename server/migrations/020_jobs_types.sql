-- 020: nới jobs CHECK cho type mới (vnpay_refund, analytics_rollup, cart_purge).
-- Không có migration này, enqueue fail-open lặng lẽ → refund/rollup không bao giờ chạy.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'order_confirmation', 'events_cleanup', 'low_stock_scan',
  'vnpay_refund', 'analytics_rollup', 'cart_purge'
));
