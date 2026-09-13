#!/usr/bin/env node
// Benchmark API — Node thuần (không dep), chạy được cả CI lẫn local.
//
// Đo: response time (p50/p95/p99) + throughput các endpoint chính.
// Chạy: node scripts/bench.js [API_URL] — mặc định http://127.0.0.1:3000
//
// Vì sao không k6/autocannon: 0 dependency mới (ràng buộc dự án), đủ cho
// mục tiêu "có benchmark + số liệu + lý do" — p50/p95 bằng histogram thật.

'use strict'

const BASE = process.argv[2] || process.env.API_URL || 'http://127.0.0.1:3000'
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 10
const DURATION_MS = Number(process.env.BENCH_DURATION_MS) || 10_000
const TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS) || 8_000

// endpoint đại diện: catalog (cached edge), catalog search, live feed,
// assistant config (nhẹ), track đơn (DB hit), llms.txt (static-ish)
const TARGETS = [
  { name: 'GET /healthz', path: '/healthz', expect: 200 },
  { name: 'GET /api/v1/products?limit=20 (list)', path: '/api/v1/products?limit=20', expect: 200 },
  { name: 'GET /api/v1/products?limit=20&q=air (search)', path: '/api/v1/products?limit=20&q=air', expect: 200 },
  { name: 'GET /api/v1/agent/tools (discovery)', path: '/api/v1/agent/tools', expect: 200 },
  { name: 'GET /api/v1/assistant/config', path: '/api/v1/assistant/config', expect: 200 },
  { name: 'GET /llms.txt', path: '/llms.txt', expect: 200 },
]

function percentiles(arr, ps) {
  const s = [...arr].sort((a, b) => a - b)
  return Object.fromEntries(ps.map((p) => {
    const i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)
    return [p, s[Math.max(0, i)]]
  }))
}

async function benchOne(t) {
  const times = []
  let errors = 0
  const stop = Date.now() + DURATION_MS
  let done = 0
  async function worker() {
    while (Date.now() < stop) {
      const t0 = performance.now()
      try {
        const r = await fetch(BASE + t.path, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        await r.arrayBuffer()
        if (r.status !== t.expect) errors++
      } catch { errors++ }
      times.push(performance.now() - t0)
      done++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  const ps = percentiles(times, [50, 95, 99])
  return {
    name: t.name,
    n: times.length,
    rps: Math.round(times.length / (DURATION_MS / 1000)),
    p50: Math.round(ps[50]),
    p95: Math.round(ps[95]),
    p99: Math.round(ps[99]),
    errors,
  }
}

async function main() {
  console.log(`# bench → ${BASE} (concurrency=${CONCURRENCY}, duration=${DURATION_MS / 1000}s mỗi endpoint)`)
  // health trước — server không lên thì báo rõ
  try {
    const r = await fetch(BASE + '/healthz', { signal: AbortSignal.timeout(3000) })
    if (!r.ok) throw new Error(`healthz ${r.status}`)
  } catch (e) {
    console.error(`Server chưa sẵn sàng tại ${BASE}: ${e.message}`)
    console.error('Chạy: npm --prefix server run dev (hoặc PORT=... node server/server.js)')
    process.exit(1)
  }
  const results = []
  for (const t of TARGETS) {
    process.stdout.write(`bench ${t.name}… `)
    const r = await benchOne(t)
    results.push(r)
    console.log(`${r.p50}ms p50 / ${r.p95}ms p95 / ${r.rps} rps / ${r.errors} lỗi`)
  }
  console.log('\n## Bảng (markdown — dán vào docs/TESTING.md)\n')
  console.log('| Endpoint | n | rps | p50 (ms) | p95 (ms) | p99 (ms) | lỗi |')
  console.log('|---|---|---|---|---|---|---|')
  for (const r of results) console.log(`| ${r.name} | ${r.n} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.errors} |`)
  const bad = results.filter((r) => r.errors > r.n * 0.01 || r.p95 > 2000)
  process.exit(bad.length ? 2 : 0) // CI gate: fail nếu >1% lỗi hoặc p95>2s
}

main()
