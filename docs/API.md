# KINETIC — API

Base URL: `/api/v1`. Content-type JSON. Auth qua httpOnly cookies (không header token).

Envelope:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

## Products

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/products` | — | List active. Query: `page`, `limit` (max 100), `q` (search tên/brand ILIKE). Trả `meta {page,limit,total,totalPages}`. |
| GET | `/products/:slug` | — | Detail + `variants [{id,size,stock}]` + collection info. |
| GET | `/products/:slug/reviews` | — | 50 reviews mới nhất + `avgRating`. |
| POST | `/products/:slug/reviews` | user | `{rating: 1–5, content?}`. Mỗi user 1 review/product (409 `REVIEW_EXISTS`). `verified` tự tính: có order (không cancelled) chứa product. |

## Cart

Guest: cookie `session_token` tự sinh khi request đầu. User: cart theo `req.user`. Login tự merge guest vào user cart.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/cart` | `{items, count, totalVnd}` — giá luôn từ DB. |
| POST | `/cart/items` | `{variantId, qty}` (qty 1–10). 404 `VARIANT_NOT_FOUND`, 409 `OUT_OF_STOCK`. |
| PATCH | `/cart/items/:id` | `{qty}` |
| DELETE | `/cart/items/:id` | Xóa 1 dòng |
| DELETE | `/cart` | Xóa cả giỏ |

## Orders

| Method | Path | Mô tả |
|---|---|---|
| POST | `/orders` | Checkout. Body: `{customerName, phone, email, address, paymentMethod: cod\|vnpay, couponCode?}`. Header tùy chọn `Idempotency-Key` — trùng key trả order cũ (`duplicate: true`). Trả `{refCode}` (KIN-XXXXXX). |
| GET | `/orders/ref/:code` | Tra đơn theo refCode — public. |

Lỗi checkout: 400 `CART_EMPTY` / `COUPON_NOT_FOUND` / `COUPON_INACTIVE` / `COUPON_NOT_STARTED` / `COUPON_EXPIRED` / `COUPON_MIN_ORDER` / `COUPON_EXHAUSTED`, 409 `OUT_OF_STOCK` / `PRODUCT_INACTIVE`.

## Auth

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/register` | `{email, password ≥8, name, phone?}`. Set 2 cookies. |
| POST | `/auth/login` | `{email, password}`. Set 2 cookies + merge guest cart. 401 `INVALID_CREDENTIALS`. |
| POST | `/auth/refresh` | Đổi `refresh_token` (7d) lấy `token` access mới (1h). Hết hạn → 401 + clear cookies. |
| POST | `/auth/logout` | Clear 2 cookies. |
| GET | `/auth/me` | User hiện tại. 401 nếu chưa đăng nhập. |

## Wishlist (đều cần login)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/wishlist` | List product_id user đã thích. |
| POST | `/wishlist/:productId` | Thêm (idempotent — trùng không lỗi). |
| DELETE | `/wishlist/:productId` | Bỏ. |

## Meta

| Method | Path | Mô tả |
|---|---|---|
| GET | `/collections` | Danh sách collection. |
| GET | `/drop` | Drop hiện tại (`ends_at` countdown). |

## Events

| Method | Path | Mô tả |
|---|---|---|
| POST | `/events` | Analytics client: `{type: view\|cart_add\|quiz_complete\|secret_mode, ...}`. |

## Admin (role admin — 401 guest, 403 user)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/admin/orders` | List đơn. |
| GET | `/admin/orders/:id` | Chi tiết đơn. |
| PATCH | `/admin/orders/:id` | `{status}` — transition hợp lệ: pending→paid/cancelled, paid→shipped/cancelled, shipped→done/cancelled. 409 nếu sai transition. Cancel hoàn stock + log RELEASE. |
| GET | `/admin/products` | List tất cả (kể cả archived). |
| POST | `/admin/products` | Tạo product. |
| PATCH | `/admin/products/:id` | Sửa product. |
| PATCH | `/admin/products/:id/archive` | Ẩn (is_active=false). |
| PATCH | `/admin/products/:id/restore` | Hiện lại. |
| POST | `/admin/inventory` | `{variantId, delta}` ±qty, log ADJUSTMENT. |
| GET | `/admin/analytics` | Revenue, orders, AOV, pending, customers, topProducts, lowStock. |

## Rate limit

- `/auth/login`, `/auth/register`: 10 request / 15 phút → 429 `RATE_LIMITED`.
- `/orders`: 20 request / phút.
