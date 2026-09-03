# KINETIC — Testing

## Chạy

```bash
cd server
node --test test/api.test.js
```

Cần PostgreSQL đang chạy + `DATABASE_URL` trong `.env`. Test tự setup + dọn dữ liệu (prefix `test-`, email `*@test.vn`).

## Bộ test hiện tại (api.test.js)

| Test | Chặn regression gì |
|---|---|
| Coupon MIN_ORDER + FREE_SHIPPING | Coupon dưới mức tối thiểu bị chặn; freeship tính phí ship 0 |
| Coupon EXHAUSTED | Usage limit hết → 400, không đặt được đơn |
| Stock race | 2 checkout đồng thời đôi cuối: đúng 1 thắng, 1 nhận 409 — FOR UPDATE hoạt động |
| Idempotency | Cùng `Idempotency-Key` → trả order cũ `duplicate:true`, không tạo đơn thứ 2 |
| Review verified (đã mua) | User có order → review `verified: true` |
| Review verified (chưa mua) | Không có order → `verified: false` |

## Cấu trúc test

- Cookie jar tự tích lũy `getSetCookie` theo tên cookie (token + session_token).
- `before()` dọn rác lần chạy fail trước — test idempotent chạy lại nhiều lần.
- Cleanup theo thứ tự FK: inventory_transactions → coupon_usages → order_items → orders → cart_items → product_variants → products (cascadevariants). User xóa sau cùng.

## Test thủ công nhanh (curl)

```bash
# login admin
curl -c /tmp/j.txt -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@kinetic.vn","password":"kinetic-admin"}'

# refresh token
curl -b /tmp/j.txt -X POST localhost:3000/api/v1/auth/refresh

# thêm giỏ + checkout
curl -b /tmp/j.txt -c /tmp/j.txt -X POST localhost:3000/api/v1/cart/items \
  -H 'Content-Type: application/json' -d '{"variantId":2,"qty":1}'
curl -b /tmp/j.txt -X POST localhost:3000/api/v1/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Test","phone":"0900123456","email":"t@t.vn","address":"1 Lê Lợi HN","paymentMethod":"cod"}'
```

## Chưa cover

- Admin transition state machine (đã test thủ công curl khi viết, chưa vào file test).
- Rate limit (thời gian chờ 15 phút — không hợp test tự động).
- Frontend (không có test UI — demo nhỏ, thử bằng tay qua `npm run dev`).
