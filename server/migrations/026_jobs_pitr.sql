-- 026: nới jobs CHECK thêm 'pitr_drill' — job PITR drill định kỳ (services/pitr_drill.js).
-- Drill chạy trong container postgres chính (có pg_basebackup); worker host chỉ orchestrator.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'order_confirmation', 'events_cleanup', 'low_stock_scan',
  'vnpay_refund', 'analytics_rollup', 'cart_purge', 'watchlist_scan', 'watchlist_alert',
  'pitr_drill'
));
