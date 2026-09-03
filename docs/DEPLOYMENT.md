# KINETIC — Deployment

## Yêu cầu

Node 20+, PostgreSQL 15+.

## Biến môi trường (`server/.env` — copy từ `.env.example`)

```
DATABASE_URL=postgresql://kinetic:kinetic@localhost:5432/kinetic
JWT_SECRET=đổi-chuỗi-này-khi-deploy
PORT=3000
```

**`JWT_SECRET` bắt buộc đổi khi deploy** — fallback dev-secret trong code chỉ chạy local.

## Các bước

```bash
# 1. Cài + migrate + seed (lần đầu)
cd server && npm install
node migrate.js
npm run db:seed

# 2. Build frontend
cd .. && npm install && npm run build   # → dist/

# 3. Chạy server (serve cả API + dist/)
cd server && node server.js
```

Kiểm: `curl localhost:3000/api/v1/products` trả envelope JSON; mở `http://localhost:3000` thấy trang.

## Kiểm tra trước khi lên production

1. `JWT_SECRET` random dài (≥32 ký tự).
2. Sau proxy/nginx: `app.set('trust proxy', 1)` trong server.js — không thì rate-limit đếm IP proxy cho tất cả user như nhau.
3. HTTPS terminate ở proxy (nginx/caddy) — cookies `sameSite: 'lax'` giữ nguyên.
4. DB user chỉ genug quyền trên schema `kinetic` (migrations chỉ CREATE TABLE/INDEX).
5. Không commit `.env` (đã trong .gitignore).

## Chạy nhiều instance (khi cần scale)

Stateless ngoài DB: cart trong PostgreSQL, JWT không cần session server. Rate-limit in-memory — nhiều instance thì limit per-instance (mỗi node tự 10 lượt). Khi cần limit chung: chuyển sang `rate-limit-redis` + Redis. Hiện 1 instance đủ.
