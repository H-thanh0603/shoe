# KINETIC — Auth

## Cookies

| Cookie | Loại | TTL | Mục đích |
|---|---|---|---|
| `token` | JWT access | 1h | Xác thực mọi request. Payload `{sub: user.id, role}`. |
| `refresh_token` | JWT refresh | 7d | Payload `{sub, typ:'refresh'}` — chỉ dùng đổi access mới. |
| `session_token` | UUID | 30d | Guest cart. Không liên quan JWT. |

Cả 3: `httpOnly: true, sameSite: 'lax'` — JS client không đọc được.

## Luồng

1. `POST /auth/register` hoặc `/auth/login` → server set `token` + `refresh_token`.
2. Request bình thường: `attachUser` middleware verify `token`, gắn `req.user`. Token sai/hết hạn = guest, không lỗi.
3. Access hết hạn (1h): `POST /auth/refresh` với cookie `refresh_token` → server verify `typ === 'refresh'` + user còn tồn tại → set access mới. Frontend (Nav.jsx) tự retry `/auth/me` một lần qua refresh khi gặp 401.
4. Refresh hết hạn (7d): 401, clear cả 2 cookies — đăng nhập lại.
5. `POST /auth/logout`: clear `token` + `refresh_token`.

## Bảo vệ chống lạm dụng token

- Refresh token không dùng được làm access: `attachUser` bỏ qua payload `typ === 'refresh'`.
- Access token không dùng được làm refresh: endpoint `/refresh` reject payload thiếu `typ:'refresh'`.
- User bị xóa giữa chừng: `/refresh` check tồn tại trong DB trước khi cấp mới.
- Secret `JWT_SECRET` từ env — fallback dev-secret chỉ chạy local, phải đổi khi deploy.

## Roles

- `user` (default): mua hàng, review, wishlist.
- `admin`: toàn bộ `/admin/*` — middleware `requireRole('admin')` (403 nếu không phải admin).

## Guest cart khi login

Login với cookie `session_token` (guest đang có giỏ): transaction merge items vào cart user theo variant, qty gộp (cap 10), xóa guest cart. Không mất gì trong giỏ khi đăng nhập.
