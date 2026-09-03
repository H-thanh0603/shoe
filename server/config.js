// Cấu hình tập trung — mọi env đọc ở đây, route/middleware không đọc process.env trực tiếp.
module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kinetic:kinetic@localhost:5432/kinetic',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-đổi-khi-deploy',
}
