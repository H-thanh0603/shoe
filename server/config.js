// Cấu hình tập trung — mọi env đọc ở đây, route/middleware không đọc process.env trực tiếp.
// dotenv được nạp ở entry (server.js/migrate.js/seed.js) TRƯỚC khi require file này.
const isProd = process.env.NODE_ENV === 'production'

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('Thiếu JWT_SECRET khi NODE_ENV=production — từ chối chạy với secret dev')
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
}
