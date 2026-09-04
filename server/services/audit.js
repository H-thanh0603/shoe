// Audit log append-only: ai (actor) làm gì (action) với cái gì (entity:id).
// Fail-open: ghi lỗi không được làm vỡ request chính.
const pool = require('../db.js')

async function audit(req, action, entity = '', entityId = '', meta = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user?.id || null, action, entity, String(entityId ?? ''), JSON.stringify(meta), req.ip || null],
    )
  } catch (e) {
    console.error('[audit] ghi log lỗi:', e.message)
  }
}

module.exports = { audit }
