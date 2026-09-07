-- Feature #1 (try-on AR): cho phép event ar_snapshot bên cạnh 4 loại cũ.
-- DB có CHECK constraint nên phải nới trước khi client gửi type mới.
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_type_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_type_check
  CHECK (type IN ('view','cart_add','quiz_complete','secret_mode','ar_snapshot'));
