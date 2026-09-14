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

## Alerting — người trực biết TRƯỚC khách hàng

Compose service `alerter` (mỗi 60s) chạy `server/scripts/alert.js`:

| Check | Bắt được |
|---|---|
| `/healthz` | process API chết |
| `/readyz` | DB/Redis chết — không bán được hàng |
| `/metrics` jobs failed ≥ 3 | jobs kẹt (mail, dọn dẹp) |
| `/metrics` AI error ≥ 50% | provider AI chết cả fallback chain |

- **Gửi Telegram** khi có `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (tạo bot
  qua @BotFather; không cấu hình → vẫn log `[ALERT]` ra stdout — docker logs thấy).
- **Chống spam**: cùng vấn đề trong 30 phút không gửi lại (state file theo
 .AlertCooldown; vẫn exit 1 để compose restart logic thấy).
- Exit code: 0 = ổn, 1 = có vấn đề (nối CronJob/k8s probe được).

Kiểm thử: `node --test test/alert.test.js` (4 case: ổn, chết, jobs+AI, cooldown).

## Staging (docker-compose.staging.yml)

Bản sao prod thu nhỏ, **dữ liệu + port + secret riêng**:

```bash
# .env cần JWT_SECRET_STAGING (BUỘT khác prod — token không dùng chéo môi trường)
docker compose -f docker-compose.staging.yml --project-name kinetic-staging up --build -d
# kiểm tra: curl http://localhost:8100/healthz
# xoá sạch kèm data: docker compose -f docker-compose.staging.yml --project-name kinetic-staging down -v
```

Khác prod: project name riêng (containers/volumes/network tách), port 8100
trực tiếp (không edge domain), volumes `pgdata_staging`/`redisdata_staging`,
KHÔNG mount /backups (không ghi đè WAL prod), seed idempotent chạy trước
start (flow test có data thật). Vòng: **merge → staging up → smoke test →
prod deploy** — migration hỏng phát hiện ở staging, không phải trước mắt
khách.
