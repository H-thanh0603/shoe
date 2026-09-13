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

## CSRF — double-submit token

`middleware/csrf.js`: server set cookie `csrf` (không httpOnly), client echo qua header `X-CSRF-Token` trên mọi POST/PATCH/DELETE (`lib/api.js` gắn tự động). Enforce khi request có auth cookie + client đã từng nhận cookie csrf (fail-open request đầu để tương thích client cũ, cookie đã set để request sau phải echo).

## Còn thiếu (chưa làm — ghi nhận)

- HTTPS/forwarded headers: khi deploy sau proxy cần `app.set('trust proxy', 1)` cho rate-limit đếm đúng IP.
- Refresh token rotation: refresh hiện không đổi mới refresh_token (chỉ cấp access mới). Khi cần revoke: thêm bảng `refresh_tokens` lưu hash + revoke được.

## Checklist 20 mục security — audit 2025 (sau AI layer)

Kết quả từng mục (chi tiết bằng chứng trong commit `6f6556c`..audit docs):

| # | Mục | Trạng thái | Bằng chứng |
|---|-----|------------|------------|
| 1 | Hide API keys | ✅ | Không file .env nào trong git; keys chỉ đọc từ env phía server; frontend không có biến provider nào |
| 2 | Check env variables | ✅ | `.env.example` chỉ placeholder; server fail-closed khi thiếu secret bắt buộc (INTERNAL_LLM_SECRET rỗng → gateway 503/401) |
| 3 | Purge git secrets | ✅ | `git log -p --all` scan: 0 secret pattern (sk-ant/AKIA/private key) |
| 4 | Protect admin routes | ✅ | `routes/admin.js`: `router.use(requireAuth, loadPerms)` + requirePerm từng route |
| 5 | Server-side auth | ✅ | JWT httpOnly cookie (không localStorage); middleware auth gắn user vào req |
| 6 | User permissions | ✅ | RBAC perm table (agent:use/read/write, orders:read, products:write…) — merchant writes staged chờ duyệt |
| 7 | RLS/DB rules | 🟡 theo chủ đích | App 1 DB role (đúng mô hình); data-scoping ở tầng app: track_order chỉ theo ref_code entropy 32^6, không trả address/email. RLS Postgres chỉ đáng thêm khi multi-tenant |
| 8 | Hash passwords | ✅ | bcryptjs cost 10 |
| 9 | Secure session cookies | ✅ | httpOnly + sameSite=lax + secure (prod); csrf cookie non-httpOnly đúng pattern double-submit |
| 10 | Encrypt sensitive data | 🟡 | Password hash (bcrypt); VNPay HMAC-SHA512 sign; PII đơn (SĐT/địa chỉ) lưu plaintext trong Postgres — cân nhắc pgcrypto/TLS-at-rest khi có yêu cầu compliance |
| 11 | Validate user input | ✅ | zod mọi route (11 file dùng validate()); tool args validate bằng zod mirror; AI layer wireSchema |
| 12 | Prevent XSS | ✅ | React escape mặc định; 0 innerHTML/dangerouslySetInnerHTML trong src/ |
| 13 | Prevent SQL injection | ✅ | 100% parameterized ($1..); 2 chỗ dynamic-SQL đều placeholder tự sinh (admin where, events VALUES) — đã soi từng dòng |
| 14 | CSRF/CORS | ✅ | CSRF double-submit middleware; CORS không cần (same-origin qua nginx/Vite proxy — không mở origin nào) |
| 15 | Secure file uploads | ✅ | express.raw type-whitelist (content-type map), 5MB cap, tên file server-generated, ext từ map, RBAC + audit log |
| 16 | Prevent field tampering | ✅ | Giá/stock luôn đọc lại từ DB trong transaction (orders, agent add_to_cart); không tin giá từ client |
| 17 | Rate limiting | ✅ | 4 lớp: nginx (50r/s general, 10r/m auth) + express-rate-limit (auth 30/10m, assistant 20/10m/IP, agent tools per-tool Redis) |
| 18 | Security headers / HTTPS | ✅ (fix) | helmet + CSP ở app; nginx edge giờ có X-Content-Type-Options/X-Frame-Options/Referrer-Policy/Permissions-Policy; HSTS comment sẵn (bật khi TLS terminate ở nginx) |
| 19 | Disable debug & prod | ✅ | NODE_ENV prod: cookie secure, stack không lộ (errorHandler envelope); AI_LOG_LEVEL mặc định info (không log prompt) |
| 20 | Scan dependencies | ✅ | `npm audit --omit=dev`: **0 vulnerabilities** (server) |

### Fix trong audit này
1. **nginx SSE rule cho assistant** — route `/api/v1/assistant/chat/stream` nằm ngoài rule SSE cũ (chỉ match `/api/v1/agent/`) → khi deploy qua nginx, stream sẽ bị buffer + đứt ở 30s. Thêm location riêng: buffering off, read/send timeout 300s (agent turn nhiều vòng tool có thể dài).
2. **Security headers edge** — thêm 4 header ở nginx (X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy) + HSTS placeholder cho lúc có cert.
3. Agent SSE timeout cũ 120s → 300s (model call trễ + multi-round).

### Đã kiểm và không cần đổi
- `track_order` lộ gì: chỉ ref_code/status/tổng/tên món — ref_code 1 tỷ entropy, không dò được.
- Upload ảnh: type-map + server-generated filename + RBAC + audit.
- `configSnapshot()`/`metrics()`/`info()`: không key (test với key giả).
