// Pool PostgreSQL — connection string lấy từ config.js
const { Pool } = require('pg')
const { databaseUrl } = require('./config.js')

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
})

module.exports = pool
