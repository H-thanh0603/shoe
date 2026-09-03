# KINETIC — Database

PostgreSQL. Chạy migrations: `cd server && node migrate.js`. Seed: `npm run db:seed`.

## Tables

| Table | Mục đích | Khóa chính ràng buộc |
|---|---|---|
| collections | nhóm sản phẩm | `slug` UNIQUE |
| products | sản phẩm | `slug` UNIQUE, `collection_id` FK |
| product_variants | size + stock | UNIQUE `(product_id, size)`, `size` 30–50, `stock >= 0` |
| product_images | ảnh theo color_hex | FK cascade |
| users | tài khoản | `email` UNIQUE, `role` user/admin |
| carts | guest (session_token) hoặc user | `session_token` UNIQUE |
| cart_items | dòng giỏ | UNIQUE `(cart_id, variant_id)`, `qty` 1–10 |
| orders | đơn hàng | `ref_code` UNIQUE (KIN-XXXXXX), `idempotency_key` UNIQUE |
| order_items | dòng đơn | FK order + variant |
| coupons | mã giảm giá | `code` UNIQUE, type PERCENTAGE/FIXED/FREE_SHIPPING |
| coupon_usages | ai dùng coupon nào | UNIQUE `(coupon_id, user_id)` |
| inventory_transactions | log mọi thay đổi stock | type SALE/RESTOCK/RELEASE/RETURN/ADJUSTMENT |
| reviews | đánh giá 1–5 sao | UNIQUE `(product_id, user_id)`, `verified` boolean |
| wishlist_items | yêu thích | UNIQUE `(user_id, product_id)` |
| product_events | view/cart_add/quiz_complete/secret_mode | — |

## Migrations

Chạy theo thứ tự tên file, một lần (ghi vào bảng `schema_migrations`):

```
001_init.sql            — core shop: products, variants, carts, orders, drops
002_shop_ext.sql         — coupons, coupon_usages, inventory_transactions, payment_status
003_order_ext.sql       — orders.idempotency_key, status transitions
004_product_dna.sql      — products: purpose, weather hints (match engine)
005_product_events.sql   — product_events (peer feature)
005_review_wishlist.sql  — reviews + wishlist_items
```

## Ràng buộc quan trọng (DB enforce, không phải app code)

- `price_vnd > 0`, `qty > 0`, `stock >= 0`, `rating 1–5`, `size 30–50` — CHECK constraints.
- Không trùng: product variant, cart item, review/user, wishlist/user, coupon/user — UNIQUE constraints.
- Xóa product → cascade variants/images; xóa user chặn bởi carts/orders FK (phải dọn theo thứ tự).

## Điểm cần biết

- Giá lưu `INTEGER` VND (không float).
- Trạng thái đơn: `pending → paid → shipped → done`, hoặc `cancelled` từ pending/paid/shipped. DB không ép transition — route admin validate qua state map.
- Stock không bao giờ UPDATE không log: checkout ghi SALE, admin restock ghi RESTOCK, cancel đơn ghi RELEASE.
