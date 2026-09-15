# KINETIC — Deployment

## Yêu cầu

Node 20+, PostgreSQL 15+.

## Biến môi trường (`server/.env` — copy từ `server/.env.example`)

```
DATABASE_URL=postgresql://kinetic:kinetic@localhost:5432/kinetic
JWT_SECRET=đổi-chuỗi-này-khi-deploy   # BẮT BUỘC (prod thiếu → từ chối chạy)
PII_KEY=<base64-32-byte>               # BẮT BUỘC prod (thiếu → PII plaintext + warn)
PORT=3000
NODE_ENV=production                   # bật cookie secure + tắt stack trace
SEED_ADMIN_EMAIL=admin@shop.vn
SEED_ADMIN_PASSWORD=<mạnh>             # seed chỉ tạo admin khi cả 2 set (không credential mặc định)
METRICS_SECRET=<random>                # gate /metrics cho alerter/LB
SENTRY_DSN=<...>                       # trống = chỉ log stderr
```

**Compose deploy** (`docker-compose.yml`): `JWT_SECRET` + `PII_KEY` bắt buộc (`${VAR:?...}` —
thiếu thì container từ chối start). VNPay/SMTP optional (thiếu → COD-only / không gửi mail).

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

1. `JWT_SECRET` random dài (≥32 ký tự). `PII_KEY` sinh theo `server/.env.example`.
   Seed admin qua `SEED_ADMIN_EMAIL/PASSWORD` — đổi pass ngay sau deploy đầu tiên.
2. `NODE_ENV=production` — bật cookie `secure`, tắt stack trace lỗi.
3. Sau proxy/nginx: `TRUST_PROXY=1` (compose đã set) — không thì rate-limit đếm IP proxy cho tất cả user như nhau.
4. HTTPS terminate ở proxy (nginx/caddy) + bật HSTS trong `ops/nginx.conf`.
5. DB user ít quyền (chỉ DML +DDL migrations trên schema shop), **backup + offsite + drill định kỳ** (xem `BACKUP.md` + `BACKUP_DRILLS.md`).
6. Không commit `.env` (server + agents đều đã gitignore).
7. AI: provider key thật trong env (`AI_API_KEY`), fallback chain nếu cần, budget
   ngày `AI_DAILY_TURNS_PER_IP` (mặc định 100/IP). Merchant bridge (`agent.js`):
   `BRIDGE_SECRET` khớp 2 bên, bridge + proxy bind loopback.

## Chạy nhiều instance (khi cần scale)

Stateless ngoài DB: cart trong PostgreSQL, JWT không cần session server. Rate-limit
shared qua Redis (`middleware/rateStore.js` — có `REDIS_URL` thì đếm chung cả cụm;
memory-only thì mỗi process đếm riêng). Compose đã set `REDIS_URL` cho app+worker.

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
