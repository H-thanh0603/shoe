# KINETIC — Shoe E-commerce

E-commerce giày thể thao: React 19 + Vite frontend, Express + PostgreSQL backend, VNPay sandbox, Redis cache/rate-limit, RBAC admin, jobs queue.

## Chạy dev

```bash
# backend (cần PostgreSQL đang chạy; cấu hình trong server/.env — xem server/.env.example)
cp server/.env.example server/.env   # sửa DATABASE_URL, JWT_SECRET
npm --prefix server run dev          # API http://localhost:3000 (server tự migrate + seed)

# frontend
npm install
npm run dev                          # Vite http://localhost:5173, proxy /api -> :3000
```

## Chạy production (Docker Compose)

```bash
cp .env.example .env                 # VITE_API_TARGET
export JWT_SECRET=<random-hex>       # compose đọc env này
docker compose up --build            # postgres + redis + app + worker + cron + backup + edge nginx
# edge: http://localhost:8081, app scale: docker compose up --scale app=2
```

## Test

```bash
npm --prefix server test             # 14 test: coupon, stock race, idempotency, vnpay sign, rbac, auth
```

## Tài liệu

Chi tiết trong `docs/`: API, AUTH, DEPLOYMENT, SECURITY, BACKUP, TESTING, ARCHITECTURE, DATABASE, PAYMENT (VNPay), CDN_WAF, INVENTORY.

## Cấu trúc chính

```
src/          React SPA (history router, Tailwind 4, three.js lazy)
server/       Express API + jobs worker + cron + migrations
ops/          nginx edge (LB + cache + rate-limit)
docs/         runbooks vận hành
```
