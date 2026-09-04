// Pool PostgreSQL — connection string lấy từ config.js
const { Pool } = require('pg')
const { databaseUrl } = require('./config.js')

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
})

// Resilience khi scale/deploy: DB restart/failover đá rớt idle connections.
// Không có listener này, pg Pool ném 'error' không ai hứng → crash cả process.
// Log + để pool tự loại client chết và reconnect (request đang chạy vẫn báo lỗi
// bình thường để client retry, LB chuyển traffic sang instance khỏe).
pool.on('error', (err) => {
  console.error('[db] pool idle client lỗi (giữ process sống, tự reconnect):', err.message)
})

module.exports = pool
