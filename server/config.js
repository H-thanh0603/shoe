// Cấu hình tập trung — mọi env đọc ở đây, route/middleware không đọc process.env trực tiếp.
// dotenv được nạp ở entry (server.js/migrate.js/seed.js) TRƯỚC khi require file này.
const isProd = process.env.NODE_ENV === 'production'

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('Thiếu JWT_SECRET khi NODE_ENV=production — từ chối chạy với secret dev')
}

// Prod fail-fast: các key làm downgrade âm thầm nếu thiếu (PII plaintext,
// rate-limit per-process, gateway/AI tắt). Báo loud lúc boot thay vì im lặng.
if (isProd) {
  const missing = [
    !process.env.PII_KEY && 'PII_KEY (thiếu → PII lưu plaintext)',
    !process.env.REDIS_URL && 'REDIS_URL (thiếu → rate-limit/cache per-process)',
    !process.env.SMTP_HOST && 'SMTP_HOST (thiếu → forgot-password không gửi mail được)',
  ].filter(Boolean)
  if (missing.length) console.error('[config] PROD thiếu env (vẫn chạy, tính năng downgrade):\n - ' + missing.join('\n - '))
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kinetic:kinetic@localhost:5432/kinetic',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-đổi-khi-deploy',
  isProd,
  // ——— caching / scale ngang ———
  // REDIS_URL bỏ trống → chạy memory-only (dev). Set khi deploy để share cache + rate-limit.
  redisUrl: process.env.REDIS_URL || '',
  cacheDefaultTtlSec: Number(process.env.CACHE_TTL_SEC) || 60,
  cacheMaxKeys: Number(process.env.CACHE_MAX_KEYS) || 1000,
  // CLUSTER_WORKERS=0/'' → 1 process. Set số CPU khi scale dọc trên 1 máy.
  clusterWorkers: Number(process.env.CLUSTER_WORKERS) || 0,
  // JOBS_ENABLED=false → tắt worker nền (vd khi chạy worker riêng với WORKER_ONLY=true)
  jobsEnabled: process.env.JOBS_ENABLED !== 'false',
  workerOnly: process.env.WORKER_ONLY === 'true',
  // TRUST_PROXY=1 khi chạy sau nginx/LB/Docker để req.ip + rate-limit đúng client
  trustProxy: process.env.TRUST_PROXY === '1' || isProd,
  // Ngưỡng rate-limit auth (login/register). CI chạy cả bộ test trên 1 IP → cần nâng.
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT) || 10,
  // Ngưỡng rate-limit checkout (/orders). Test suite bắn ~12 POST orders/run —
  // chạy dồn nhiều run trong 1 phút sẽ 429 oan, CI nâng qua env.
  checkoutRateLimit: Number(process.env.CHECKOUT_RATE_LIMIT) || 20,
  // Giới hạn mua hàng LIMITED/drop theo tài khoản (chống bot gom hàng).
  // null/0 = không giới hạn. Guest (không user_id) không định danh được → bỏ qua.
  limitedMaxPerUser: Number(process.env.LIMITED_MAX_PER_USER) || 2,
}
