# KINETIC — Inventory

## Nguyên tắc

Mọi thay đổi stock nằm trong transaction + ghi 1 dòng `inventory_transactions` — không có đường cập nhật stock nào không để lại log.

Transaction types: `SALE` (checkout), `RESTOCK` (admin thêm), `RELEASE` (cancel hoàn lại), `RETURN` (dự phòng), `ADJUSTMENT` (admin trừ/sửa).

## Chống oversell (§16)

Checkout: `BEGIN` → `SELECT ... FOR UPDATE OF pv` lock **tất cả** variant rows của cart cùng lúc → check stock từng item → nếu đủ: UPDATE stock, ghi SALE, tạo order, COMMIT. Hai request cùng mua đôi cuối size hot: 1 request chờ lock, thấy stock thiếu, 409 `OUT_OF_STOCK`. Không bao giờ âm stock (`CHECK (stock >= 0)` cũng chặn ở DB).

## Các đường thay đổi stock

| Hành động | Nơi | Log |
|---|---|---|
| Mua hàng | `POST /orders` | SALE (qty âm, before/after, reference order id) |
| Cancel đơn | `PATCH /admin/orders/:id` | RELEASE (qty dương, hoàn đủ items) |
| Admin ± | `POST /admin/inventory` `{variantId, qty}` (qty ≠ 0) | RESTOCK (dương) / ADJUSTMENT (âm) |

Admin inventory cũng `FOR UPDATE` — không đua với checkout đang chèn.

## Ràng buộc DB

- `stock >= 0` CHECK.
- Cart item + cart stock check: thêm/sửa trong giỏ không vượt stock hiện tại (409 `OUT_OF_STOCK`).

## Chống bot gom hàng LIMITED

`POST /orders`: sản phẩm `tag='LIMITED'` bị giới hạn `LIMITED_MAX_PER_USER` đôi/tài khoản (mặc định 2, cộng dồn các đơn chưa hủy).
Check chạy trong transaction, SAU khi lock variant rows → 2 checkout cùng lúc của 1 user nối đuôi nhau, request sau thấy đơn trước đã commit → không lọt. Đơn `cancelled` không tính.
Guest (không `user_id`) không định danh được → bỏ qua (chống bom hàng COD theo SĐT vẫn áp dụng). Lỗi 409 `LIMITED_PER_USER_CAP`, message hiện thẳng ở checkout.

## Khi cần thêm

- (đã xong) Giới hạn 1 người mua quá nhiều size hot: rule per-user trong checkout loop — xem trên.
