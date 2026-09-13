-- 017: refund thật qua VNPay API — note kết quả refund cho admin xem
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_refund_note text;
