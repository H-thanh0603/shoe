# BACKEND_IMPLEMENTATION_PLAN.md

Theo BACKEND.md §02. Trạng thái: Bước 1-2 đã xong TRƯỚC khi BACKEND.md xuất hiện (commit 70f2bff, 77bf5c4) — plan này bù phần phân tích + lộ trình phần còn lại.

## 1. Frontend audit (đã xong)

- Stack: Vite 7 + React 19 + Tailwind v4. Pages: homepage 1 trang (App.jsx), chưa có router.
- Components: Nav (mega menu, BAG badge hardcode 0), Hero, Marquee, ProductGrid (asymmetric grid), Collections, Drop (countdown), Footer.
- Data: `useApi(url, mapFn)` hook — fetch + AbortController. Đã gọi /api/products, /api/collections, /api/drop. Không còn mock data.
- Product model frontend giả định: `{ id, slug, name, brand, description, price (string "4.190.000₫"), price_vnd, colors (hex[]), tag, span, collection_id }`. Detail sẽ cần thêm: `variants [{ id, size, stock }]`, `collection_slug/name`.
- Cart state: chưa có (badge hardcode). Checkout: chưa có. Auth: chưa có. Admin UI: chưa có. Search: chưa có (chỉ SEARCH button trống). Wishlist/review: chưa có.
- Kết luận: backend tương thích shape trên, KHÔNG redesign UI (§82).

## 2. Stack (user đã duyệt + §04 cho phép framework tương đương)

| Layer | Chọn |
|---|---|
| Framework | Express 5 (đã chạy) — KHÔNG đổi sang NestJS |
| DB | PostgreSQL + `pg` Pool, raw SQL (không ORM — schema nhỏ, SQL rõ) |
| Validation | zod (đã có middleware/validate.js) |
| Auth | JWT + bcryptjs (users table đã có slot role) |
| Payment | VNPay sandbox trước, COD cùng lúc; abstraction PaymentProvider |
| Cache | Bỏ giai đoạn này (chỉ 6 products). Thêm Redis khi có traffic thật |
| Queue | Bỏ giai đoạn này. Email = success page + ref code |

## 3. Chuẩn hóa API (vi phạm spec hiện tại, sửa ngay trong Bước 3)

- Prefix `/api/v1` (§59): mount `app.use('/api/v1', ...)`. Frontend: đổi useApi base 1 chỗ.
- Envelope (§41): success `{ success: true, data }`, error `{ success: false, error: { code, message } }`. useApi unwrap `.data` — frontend không đổi gì khác.
- Pagination (§40): products list `?page&limit` + meta. Hiện 6 products vẫn trả đủ shape để frontend future-proof.

## 4. Database (migration 001 đã chạy — sẽ mở rộng bằng 002+)

Đã có: collections, products, product_variants, product_images, users, carts, cart_items, orders, order_items, drops.

Mở rộng (migration 002):
- `inventory_transactions (id, variant_id, qty, before_qty, after_qty, type RESTOCK|SALE|RELEASE|RETURN|ADJUSTMENT, reference_id, created_at)` — §15 mọi thay đổi stock có lịch sử. Bỏ bảng Inventory riêng: `product_variants.stock` = available, transaction log là audit (đơn giản, đúng ý spec).
- `coupons (id, code UNIQUE, type PERCENTAGE|FIXED|FREE_SHIPPING, value, minimum_order_vnd, usage_limit, per_user_limit, starts_at, expires_at, status)` + `coupon_usages (coupon_id, order_id)` — §27.
- `reviews (id, product_id, user_id, rating 1-5, content, created_at)` — phase review.
- `wishlists` bỏ bảng riêng: `wishlist_items (user_id, product_id, UNIQUE)` đủ — phase sau.
- orders: thêm `order_number` (đã có ref_code KIN-XXXXXX), `payment_status`, `shipping_fee_vnd`, `discount_vnd`.

## 5. ER (tóm tắt)

users 1—n orders; orders 1—n order_items n—1 product_variants n—1 products n—1 collections; carts 1—n cart_items n—1 product_variants; products 1—n reviews n—1 users; coupons n—n orders qua coupon_usages; product_variants 1—n inventory_transactions.

## 6. Kiến trúc server

```
server/
  db.js              pool + transaction helper (withTransaction)
  migrate.js          đã có
  seed.js            đã có — phase sau nâng 50+ products (§79)
  server.js          mount /api/v1
  routes/            products.js, meta.js (đã có) + cart.js, auth.js, orders.js, pay.js, coupons.js, admin/*.js
  middleware/        validate.js (đã có) + auth.js (JWT verify + requireRole), errors.js (envelope + no stack trace)
```

Không service layer riêng cho phase này — routes tự chứa SQL, logic giá gom vào `routes/orders.js` tính từ DB (§24 backend tính lại toàn bộ). Khi logic phình >200 dòng/file → tách services/ (điểm nâng cấp, không tạo trước).

## 7. Auth (§37, §06-07)

- POST /api/v1/auth/register {email, password, name, phone} — bcrypt hash, JWT trong httpOnly cookie.
- POST /api/v1/auth/login, POST /api/v1/auth/logout.
- Roles: user | admin (đã có trong 001, thêm staff khi cần admin thật sự).
- Guest cart: session_token cookie — merge vào user cart khi login.
- IDOR: order lookup bằng ref_code CHỈ cho chủ order (user_id match) hoặc admin.

## 8-9. Inventory (§14-16)

- Checkout flow: `BEGIN; SELECT ... FOR UPDATE` lock variant rows → check stock → UPDATE stock → INSERT inventory_transaction(SALE) → INSERT order + items → COMMIT. Rollback nếu thiếu.
- Cancel: transition validate (§22 state machine pending→confirmed→shipped→done; cancelled từ pending|confirmed) + RETURN transaction hoàn stock.
- Race 2 user mua size cuối: FOR UPDATE đảm bảo 1 thắng — test case bắt buộc (§62).

## 10. Cart (§33, §17-18)

- GET /api/v1/cart (từ cookie), POST /api/v1/cart/items {variantId, qty} — validate variant active + stock đủ, giá KHÔNG nhận từ client, GET tính giá hiện tại từ DB.
- PATCH /api/v1/cart/items/:id {qty}, DELETE /api/v1/cart/items/:id, DELETE /api/v1/cart.
- Frontend: CartContext (useReducer) + CartDrawer + badge thật (Bước 3).

## 11-12. Order + Payment (§20-26)

- POST /api/v1/orders: từ cart, zod validate {customerName, phone, email, address, paymentMethod cod|vnpay, couponCode?}. Backend tính subtotal từ DB + coupon + shipping (free > 2tr, 30k else) → total. Ref code KIN-XXXXXX. Idempotency-Key header chống double submit (§26).
- PaymentProvider abstraction: `pay.js` export { cod: noop, vnpay: buildUrl+verifyReturn }. VNPay sandbox HMAC SHA256. Return endpoint: verify checksum + amount + order → paid → (stock đã trừ lúc tạo order — reserve-on-create, cancel hoàn).
- State machine transition validate trong 1 hàm `transitionOrder(from → to)`.

## 13. Coupon (§27)

- POST /api/v1/coupons/validate {code, subtotal} — check expires, minimum, usage_limit. Áp dụng trong order create, ghi coupon_usages. Bỏ promotion engine (§28) — phase sau.

## 14. Review (§36)

Phase sau auth. Verified Purchase = user_id có order chứa product đó.

## 15. Search (§30-31)

PostgreSQL ILIKE + index trước. Phase sau Shopping Core. pg_trgm khi cần fuzzy.

## 16. Admin (§39, §67-70)

Phase riêng sau: /api/v1/admin/* + requireRole('admin') + audit_logs. Đã seed admin@kinetic.vn.

## 17. Security (§44-45, §75)

Có sẵn/ngay: parameterized SQL (pg $1 — mọi query), zod mọi POST, bcrypt, httpOnly cookie, envelope không stack trace.
Thêm: rate-limit login/checkout (express-rate-limit — dependency mới, chỉ 1), JWT_SECRET env + .env.example (§76), helmet headers.
Bỏ giờ: CSRF token (cart cookie SameSite=Lax + JSON API), upload (chưa có ảnh thật).

## 18-19. Cache, jobs, testing, deployment

Bỏ phase này (6 products, không email). Testing: mỗi logic khó (transition state machine, coupon, stock race) 1 file test node:test nhỏ (§61 unit đủ). Docker + docs/ 9 file (§77, §80): phase deploy cuối.

## Thứ tự thực hiện (tiếp tục từ task list, commit+push mỗi bước)

1. ✅ Bước 1-2 (đã xong trước plan này)
2. **Bước 3 (đang làm)**: /api/v1 + envelope + pagination chuẩn hóa, cart API + CartContext + drawer, migration 002 (inventory_transactions, coupons, orders mở rộng)
3. **Bước 4**: ProductDetail page — size từ stock, ADD TO BAG
4. **Bước 5**: orders + checkout + COD + VNPay sandbox + idempotency + coupon
5. **Bước 6**: router + auth (login/register) + smoke test toàn flow + test case race/coupon
6. Phase sau: search, review, wishlist, admin, 50+ products seed, Redis, Docker, docs/

## 20. Score tự đánh giá hiện tại (§84 trung thực)

- Backend Architecture: 55/100 (chưa v1, chưa envelope — sửa bước 3)
- Database: 60/100 (thiếu inventory_transactions, coupons — migration 002)
- Security: 50/100 (chưa auth, chưa rate limit, chưa .env.example)
- E-commerce Logic: 30/100 (chưa checkout)
- Production Readiness: 25/100 (seed 6 products, không test, không Docker)
