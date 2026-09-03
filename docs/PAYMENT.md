# KINETIC — Payment

## Hiện trạng

2 phương thức, lưu ở `orders.payment_method`:

| Method | Xử lý |
|---|---|
| `cod` | Thanh toán khi nhận. `payment_status = 'unpaid'` tới khi admin xác nhận. |
| `vnpay` | Placeholder — chọn được khi checkout, lưu DB. **Chưa tích hợp VNPay sandbox** (plan ghi bỏ scope). Xử lý như COD. |

## Trạng thái thanh toán

`orders.payment_status`: `unpaid` → `paid` → `refunded` (CHECK constraint). Hiện set `unpaid` khi tạo order.

Luồng thực tế hiện tại: order tạo `pending`/`unpaid` → admin `PATCH /admin/orders/:id {status:'paid'}` (đổi cả trạng thái đơn) → shipped → done.

## Tổng tiền server tính

```
subtotal   = Σ (price_vnd × qty)  — lấy từ DB, không tin client
discount   = coupon (PERCENTAGE / FIXED min(subtotal) / FREE_SHIPPING)
shipping   = 0 nếu freeShipping hoặc subtotal ≥ 2.000.000₫, ngược lại 30.000₫
total      = max(subtotal - discount + shipping, 0)
```

Lưu `INTEGER` VND.

## Tích hợp VNPay thật khi cần

1. Đăng ký sandbox TPUVN, lấy `vnp_TmnCode` + `vnp_HashSecret`.
2. Thêm route `POST /orders/:id/vnpay-url` tạo redirect URL (hmac SHA512 theo spec VNPay).
3. Thêm callback `GET /vnpay/return` verify checksum → cập nhật `payment_status` + order `paid`.
4. Chỉ khi dự án cần cổng thật — hiện COD đủ cho demo.
