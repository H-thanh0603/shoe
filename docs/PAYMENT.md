# KINETIC — Payment

## Hiện trạng

2 phương thức, lưu ở `orders.payment_method`:

| Method | Xử lý |
|---|---|
| `cod` | Thanh toán khi nhận. `payment_status = 'unpaid'` tới khi admin xác nhận. |
| `vnpay` | **Tích hợp VNPay sandbox thật** — `POST /orders` sinh `paymentUrl` (cổng `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`), return/IPN verify chữ ký HMAC SHA512 rồi cập nhật `payment_status` → `paid`. Cấu hương via env `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` (xem `server/.env.example`). Bỏ trống → checkout vnpay trả `PAYMENT_UNAVAILABLE` (chỉ COD chạy). |

## Trạng thái thanh toán

`orders.payment_status`: `unpaid` → `paid` → `refunded` (CHECK constraint). COD set `unpaid` khi tạo order. VNPay đổi `unpaid` → `paid` server-side khi return/IPN verify khớp (idempotent — callback trùng chỉ trả Confirm).

Luồng: order tạo `pending`/`unpaid` → VNPay return ok → `paid` (đơn status `pending` → `paid`) → admin `PATCH /admin/orders/:id` shipped → done.

## Tổng tiền server tính

```
subtotal   = Σ (price_vnd × qty)  — lấy từ DB, không tin client
discount   = coupon (PERCENTAGE / FIXED min(subtotal) / FREE_SHIPPING)
shipping   = 0 nếu freeShipping hoặc subtotal ≥ 2.000.000₫, ngược lại 30.000₫
total      = max(subtotal - discount + shipping, 0)
```

Lưu `INTEGER` VND. VNPay amount = `total × 100` (minor unit), `vnp_TxnRef` = order id, `vnp_ReturnUrl` = absolute URL dinh từ request (env override full URL khi nado).

## Flow VNPay (sandbox)

1. Đăng ký sandbox TPUVN → env `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, optional `VNPAY_RETURN_URL` (default `/api/v1/payments/vnpay/return`).
2. `POST /orders` paymentMethod=`vnpay` → order `pending`/`unpaid` + trả `paymentUrl`; frontend `location.href` sang cổng.
3. `GET /api/v1/payments/vnpay/return` — browser redirect về sau thẻ: verify hash → `payment_status='paid'` → 302 sang SPA `/tra-don/:refCode?payment=ok|fail`.
4. `GET /api/v1/payments/vnpay/ipn` — server-to-server: trả JSON `{RspCode, Message}`.
5. Sandbox test: thẻ NCB 970419852619143388, tên NGUYEN VAN A, 07/15, OTP 123456.

Signed data: toàn bô vnp_* param (incl. `vnp_SecureHashType`), sort key asc, exclude `vnp_SecureHash`, value encod PHP urlencode (space→`+`). Hash = HMAC-SHA512 hex.

## Lên VNPay production (live)

Code sign/verify/IPN đã đúng spec, không cần đổi. Khi có TMN code thật:

1. Đăng ký merchant VNPay thật → nhận `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` bản live.
2. Đổi cổng sandbox → live trong `server/services/vnpay.js` (`c.payUrl`) — env hóa thành `VNPAY_PAY_URL` khi làm.
3. `VNPAY_RETURN_URL` phải là URL public HTTPS (qua edge nginx), VNPay cần whitelist domain.
4. Kiểm tra IPN: VNPay live push server-to-server — đảm bảo port 443 edge mở từ IP VNPay.
