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
}
