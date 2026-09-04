# KINETIC — Deployment

## Yêu cầu

Node 20+, PostgreSQL 15+.

## Biến môi trường (`server/.env` — copy từ `.env.example`)

```
DATABASE_URL=postgresql://kinetic:kinetic@localhost:5432/kinetic
JWT_SECRET=đổi-chuỗi-này-khi-deploy   # BẮT BUỘC đổi (xem checklist)
PORT=3000
NODE_ENV=production                   # bật cookie secure + tắt stack trace
BRIDGE_URL=http://127.0.0.1:4001
BRIDGE_SECRET=đổi-chuỗi-này           # phải khớp agents/.env
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

1. `JWT_SECRET` random dài (≥32 ký tự). Đổi pass admin seed `kinetic-admin` ngay sau deploy đầu tiên (seed không tự rotate).
2. `NODE_ENV=production` — bật cookie `secure`, tắt stack trace lỗi.
3. Sau proxy/nginx: `app.set('trust proxy', 1)` trong server.js — không thì rate-limit đếm IP proxy cho tất cả user như nhau.
4. HTTPS terminate ở proxy (nginx/caddy).
5. DB user ít quyền (chỉ DML +DDL migrations trên schema shop), **backup Postgres định kỳ** (chưa có là mất đơn/kho khi sập đĩa).
6. Không commit `.env` (server + agents đều đã gitignore).
7. AI (nếu bật chat/agent): `BRIDGE_SECRET` khớp 2 bên, bridge + proxy bind loopback, điền key LLM thật, đặt ngân sách/ngày cho provider.

## Chạy nhiều instance (khi cần scale)

Stateless ngoài DB: cart trong PostgreSQL, JWT không cần session server. Rate-limit in-memory — nhiều instance thì limit per-instance (mỗi node tự 10 lượt). Khi cần limit chung: chuyển sang `rate-limit-redis` + Redis. Hiện 1 instance đủ.
