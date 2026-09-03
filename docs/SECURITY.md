# KINETIC — Security

## Mật khẩu

`bcryptjs` hash cost 10. Không bao giờ trả `password_hash` — login strip trước response.

## JWT / cookies

- `token` (access 1h) + `refresh_token` (7d) — `httpOnly`, `sameSite: 'lax'`. JS client không đọc được.
- Refresh-type token bị `attachUser` reject làm access; access token bị `/refresh` reject làm refresh.
- `JWT_SECRET` từ env. Fallback dev-secret chỉ local — **phải đổi khi deploy**.

## Rate limit (express-rate-limit)

| Route | Giới hạn | Phản ứng |
|---|---|---|
| `/auth/login`, `/auth/register` | 10 / 15 phút | 429 `RATE_LIMITED` |
| `/orders` | 20 / phút | 429 `RATE_LIMITED` |

Limiter mount **trước** routes — mount sau thì không chạy (đã từng bug).

## Helmet + CSP

Default helmet directives, override:

- `connect-src`: `'self'` + `https://api.open-meteo.com` (weather match engine).
- `style-src`: thêm `'unsafe-inline'` + `https:` (Tailwind inject style inline).

## Input validation

Zod schema mọi route có body (`validate` middleware, 400 `VALIDATION_ERROR`). Viết lại email/phone/dạng số — regex phone VN `^(0|\+84)\d{8,10}$`.

## SQL injection

100% parameterized queries (`$1, $2...`) — không có chuỗi SQL ghép input. ILIKE search dùng tham số.

## Tin cậy client

- Giá tính lại từ DB lúc checkout — client chỉ gửi variantId + qty.
- Coupon áp dụng sau khi validate: status, thời gian, min order, usage limit — server quyết.
- `verified` review: server check order thật của user, không nhận từ client.

## Còn thiếu (chưa làm — ghi nhận)

- CSRF: sameSite=lax chặn cross-site POST từ site khác nhưng chưa có CSRF token. API thuần JSON + cookie lax = rủi ro thấp hiện tại.
- HTTPS/forwarded headers: khi deploy sau proxy cần `app.set('trust proxy', 1)` cho rate-limit đếm đúng IP.
- Refresh token rotation: refresh hiện không đổi mới refresh_token (chỉ cấp access mới). Khi cần revoke: thêm bảng `refresh_tokens` lưu hash + revoke được.
