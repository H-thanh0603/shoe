// Request ID + đếm request tối giản cho /metrics.
// Mỗi request có X-Request-Id (client gửi lên thì giữ, không thì cấp) để lần theo log.
// Counters nằm trong process (scale ngang/nhiều worker thì mỗi instance đếm riêng —
// Prometheus cộng lại bằng sum(); cần chính xác tuyệt đối thì đẩy sang Redis/OTLP sau).
const crypto = require('node:crypto')

const startedAt = Date.now()
const counts = { total: 0, ok: 0, clientErr: 0, serverErr: 0 }

function requestId(req, res, next) {
  const rid = req.get('X-Request-Id')?.slice(0, 64) || crypto.randomUUID()
  req.id = rid
  res.set('X-Request-Id', rid)
  counts.total++
  const done = () => {
    if (res.statusCode < 400) counts.ok++
    else if (res.statusCode < 500) counts.clientErr++
    else counts.serverErr++
  }
  res.on('finish', done)
  next()
}

function snapshot() {
  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    pid: process.pid,
    rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    ...counts,
  }
}

module.exports = { requestId, snapshot }
