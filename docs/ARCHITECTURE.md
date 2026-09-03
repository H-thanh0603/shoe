# KINETIC — Architecture

## Tổng quan

Monolith 2 phần trong 1 repo:

```
┌──────────────┐     /api/v1/*      ┌─────────────────┐
│ React 19     │ ──────────────────▶│ Express 5        │
│ Vite 7       │   httpOnly cookies │ raw SQL (pg)     │
│ dist/ (build)│◀────────────────── │ PostgreSQL       │
└──────────────┘   JSON envelope   └─────────────────┘
```

- **Frontend**: `src/` — React 19 + Vite 7, Tailwind. Build ra `dist/`, Express serve static + SPA fallback.
- **Backend**: `server/` — Express 5, `pg` pool + raw SQL (không ORM), zod validate, JWT httpOnly cookies.
- **DB**: PostgreSQL. Migrations chạy bằng `node server/migrate.js`.

## Luồng request

```
request → helmet (CSP) → express.json → cookieParser → attachUser (JWT)
        → rate-limit (auth/checkout) → route → zod validate → raw SQL → envelope
```

Middleware order quan trọng: rate-limit mount **trước** routes, nếu không không ăn.

## Envelope API

Mọi response:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "Mã_LỖI", "message": "Thông điệp người dùng" } }
```

List có pagination: `data.items` + `data.meta { page, limit, total, totalPages }`.

## Auth (ngắn — chi tiết docs/AUTH.md)

- Access token JWT 1h — cookie `token`.
- Refresh token JWT 7d — cookie `refresh_token`, claim `typ:'refresh'`.
- Guest cart: cookie `session_token`. Login merge guest cart vào user cart.

## State chính

| Nơi | State |
|---|---|
| Server | DB duy nhất (không Redis, không in-memory cart) |
| Client | CartContext (React context), profile quiz (localStorage) |

## Quy ước

- Giá luôn tính lại từ DB khi checkout — không tin giá client.
- Oversell chặn bằng `SELECT ... FOR UPDATE` trong 1 transaction.
- Mọi thay đổi stock ghi `inventory_transactions` (SALE/RESTOCK/RELEASE/RETURN/ADJUSTMENT).

## Thư mục

```
server/
├── server.js          # app + mount + helmet + rate-limit
├── db.js              # pg pool singleton
├── migrate.js         # chạy migrations theo thứ tự tên file
├── seed.js            # dữ liệu mẫu + admin account
├── migrations/        # 001_*.sql ... 005_*.sql
├── middleware/        # auth.js (JWT), validate.js (zod)
├── routes/            # 1 file / resource: products, cart, orders, auth,
│                      # wishlist, admin, events, meta
└── test/              # node:test — api.test.js
```
