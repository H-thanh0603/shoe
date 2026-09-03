// Pool PostgreSQL — DATABASE_URL từ env, default local kinetic.
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://kinetic:kinetic@localhost:5432/kinetic',
  max: 10,
})

module.exports = pool
