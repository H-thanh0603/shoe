-- 010: ảnh sản phẩm thật (Unsplash, hotlink w=800).
-- Mỗi product 2 ảnh: chính ((id-1) % 8) + phụ ((id+2) % 8). Idempotent.
WITH u(url, i) AS (VALUES
  ('https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80&auto=format&fit=crop', 0),
  ('https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80&auto=format&fit=crop', 1),
  ('https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80&auto=format&fit=crop', 2),
  ('https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&q=80&auto=format&fit=crop', 3),
  ('https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&q=80&auto=format&fit=crop', 4),
  ('https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80&auto=format&fit=crop', 5),
  ('https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80&auto=format&fit=crop', 6),
  ('https://images.unsplash.com/photo-1605348532760-6753d2c43329?w=800&q=80&auto=format&fit=crop', 7)
)
INSERT INTO product_images (product_id, url, sort)
SELECT p.id, u.url, 0
FROM products p JOIN u ON u.i = ((p.id - 1) % 8)
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = p.id);

WITH u(url, i) AS (VALUES
  ('https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80&auto=format&fit=crop', 0),
  ('https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80&auto=format&fit=crop', 1),
  ('https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80&auto=format&fit=crop', 2),
  ('https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&q=80&auto=format&fit=crop', 3),
  ('https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&q=80&auto=format&fit=crop', 4),
  ('https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80&auto=format&fit=crop', 5),
  ('https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80&auto=format&fit=crop', 6),
  ('https://images.unsplash.com/photo-1605348532760-6753d2c43329?w=800&q=80&auto=format&fit=crop', 7)
)
INSERT INTO product_images (product_id, url, sort)
SELECT p.id, u.url, 1
FROM products p JOIN u ON u.i = ((p.id + 2) % 8)
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = p.id AND sort = 1);
