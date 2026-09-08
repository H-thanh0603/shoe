-- 016: ảnh sản phẩm local (public/img/products) — đồ án tự chứa, không phụ thuộc hotlink Unsplash.
-- 8 ảnh đã tải sẵn vào public/img/products/p0..p7.jpg (bản copy của 8 URL trong migration 010).
-- Idempotent: chạy lần 2 không còn URL nào khớp → 0 dòng update.
WITH m(old, new) AS (VALUES
  ('1542291026-7eec264c27ff', '/img/products/p0.jpg'),
  ('1549298916-b41d501d3772', '/img/products/p1.jpg'),
  ('1595950653106-6c9ebd614d3a', '/img/products/p2.jpg'),
  ('1600185365483-26d7a4cc7519', '/img/products/p3.jpg'),
  ('1560769629-975ec94e6a86', '/img/products/p4.jpg'),
  ('1608231387042-66d1773070a5', '/img/products/p5.jpg'),
  ('1606107557195-0e29a4b5b4aa', '/img/products/p6.jpg'),
  ('1605348532760-6753d2c43329', '/img/products/p7.jpg')
)
UPDATE product_images pi
SET url = m.new
FROM m
WHERE pi.url LIKE '%' || m.old || '%';