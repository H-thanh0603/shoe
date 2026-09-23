# KINETIC — Testing

## Chạy

```bash
cd server
node --test test/api.test.js
```

Cần PostgreSQL đang chạy + `DATABASE_URL` trong `.env`. Test tự setup + dọn dữ liệu (prefix `test-`, email `*@test.vn`).

Chạy API test **từng file tuần tự** — `node --test` nhiều file chạy parallel, các file dọn DB chồng nhau (`LIKE '%@test.vn'`) → flaky. CI cũng chạy tuần tự (xem `ci.yml`).
Chạy dồn nhiều run trong 1 phút có thể dính `RATE_LIMITED` ở `/orders` — nâng `CHECKOUT_RATE_LIMIT` (mặc định 20/phút) khi test.

## Bộ test hiện tại (api.test.js)

| Test | Chặn regression gì |
|---|---|
| Coupon MIN_ORDER + FREE_SHIPPING | Coupon dưới mức tối thiểu bị chặn; freeship tính phí ship 0 |
| Coupon EXHAUSTED | Usage limit hết → 400, không đặt được đơn |
| Stock race | 2 checkout đồng thời đôi cuối: đúng 1 thắng, 1 nhận 409 — FOR UPDATE hoạt động |
| Idempotency | Cùng `Idempotency-Key` → trả order cũ `duplicate:true`, không tạo đơn thứ 2 |
| Review verified (đã mua) | User có order → review `verified: true` |
| Review verified (chưa mua) | Không có order → `verified: false` |
| COD_LIMITED | SĐT 4 đơn COD/24h → 429, chống bom hàng |
| Auth rotation/revoke/logout-all/reset 1-lần-dùng (`auth.test.js`) | Refresh reuse → revoke session; reset link dùng 1 lần, đá session cũ |
| RBAC (`rbac.test.js`) | Chưa role 403; gán/thu vai trò có hiệu lực ngay + audit log |
| Admin order transition (`admin-transition.test.js`) | State machine §70: happy path từng bước, nhảy cóc 409, enum lạ 400, đơn lạ 404, cancel hoàn stock + `inventory_transactions` RESTOCK, terminal state |

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

- ~~Admin transition state machine~~ — đã có `admin-transition.test.js` (cần server chạy + seed admin, giống `rbac.test.js`).
- Rate limit (thời gian chờ 15 phút — không hợp test tự động).
- Frontend (không có test UI — demo nhỏ, thử bằng tay qua `npm run dev`).

Lưu ý môi trường local: test process đọc `JWT_SECRET` từ env export (CI set sẵn);
chạy tay trên máy dev cần `export $(grep -E '^(DATABASE_URL|JWT_SECRET)=' server/.env)`
trước khi chạy file test API (dotenv 17 không export vào `process.env` cho process con
require trực tiếp). Counter COD (`cod_abuse`) sống theo SĐT — chạy test lặp nhiều
lần trong 24h có thể dính `COD_LIMITED` oan; xóa bảng `cod_abuse` giữa các lần chạy dồn.

## Benchmark API (mục tiêu performance — có số liệu thật)

Script: `server/scripts/bench.js` (Node thuần, 0 dependency). Cách chạy:

```bash
node server/server.js &          # hoặc npm --prefix server run dev
node server/scripts/bench.js     # hoặc: node server/scripts/bench.js http://localhost:3000
```

Tuỳ biến qua env: `BENCH_CONCURRENCY` (10), `BENCH_DURATION_MS` (10s/endpoint),
`BENCH_TIMEOUT_MS` (8s). Exit code 2 = CI gate fail (lỗi >1% hoặc p95 > 2s).

### Kết quả đo thật (dev machine, 2025-06, Node 22, concurrency=10, 10s/endpoint)

| Endpoint | n | rps | p50 (ms) | p95 (ms) | p99 (ms) | lỗi |
|---|---|---|---|---|---|---|
| GET /healthz | 1280 | 128 | 71 | 112 | 297 | 0 |
| GET /api/v1/products?limit=20 (list) | 1459 | 146 | 65 | 91 | 121 | 0 |
| GET /api/v1/products?limit=20&q=air (search) | 1503 | 150 | 64 | 86 | 101 | 0 |
| GET /api/v1/agent/tools (discovery) | 1397 | 140 | 67 | 95 | 120 | 0 |
| GET /api/v1/assistant/config | 1199 | 120 | 77 | 101 | 136 | 0 |
| GET /llms.txt | 51976 | 5198 | 2 | 3 | 7 | 0 |

**So mục tiêu đề ra**: normal API < 300–500ms → thực tế p95 86–112ms (**đạt
3–5×**); heavy API < 1–2s → không có endpoint nào nặng trong tập đo (assistant
SSE là stream dài — thời gian tới first byte ≈ normal API, tổng thời gian
phụ thuộc model). `llms.txt` 2ms vì nginx/app trả static memory.

Giải thích vì sao không k6/autocannon: mục tiêu là "có benchmark + số liệu +
lý do rõ ràng"; Node thuần đủ histogram p50/p95/p99 chính xác, chạy được CI
không cài thêm gì (ràng buộc dự án: không thêm dependency).
