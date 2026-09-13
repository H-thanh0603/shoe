#!/usr/bin/env node
// Alert check — chạy định kỳ (compose service / k8s CronJob / crontab * * * * *).
//
// Kiểm tra: /healthz (liveness), /readyz (DB + cache), /metrics (jobs stuck/
// failed, AI errors). Phát hiện vấn đề → gửi Telegram (nếu cấu hình) + log.
// Không cấu hình Telegram → vẫn chạy, chỉ log (đủ cho CI + stdout monitoring).
//
// Env:
//   ALERT_API_URL    — base URL của app (mặc định http://127.0.0.1:3000)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — để nhận alert thật
//   ALERT_JOBS_FAILED_MAX — ngưỡng jobs failed (mặc định 3)
//   ALERT_AI_ERROR_RATE  — ngưỡng tỉ lệ lỗi AI 0..1 (mặc định 0.5)
//
// Anti-spam: state file .alert-state.json (mtime alert gần nhất) — cùng vấn đề
// trong ALERT_COOLDOWN_MIN (mặc định 30) không spam lại.
//
// Usage: node scripts/alert.js   (exit 0 = mọi thứ ổn HOẶC chỉ log; exit 1 = cần can thiệp)

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const API = process.env.ALERT_API_URL || 'http://127.0.0.1:3000'
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const CHAT = process.env.TELEGRAM_CHAT_ID || ''
const JOBS_FAILED_MAX = Number(process.env.ALERT_JOBS_FAILED_MAX || 3)
const AI_ERROR_RATE = Number(process.env.ALERT_AI_ERROR_RATE || 0.5)
const COOLDOWN_MIN = Number(process.env.ALERT_COOLDOWN_MIN || 30)
const STATE_FILE = process.env.ALERT_STATE_FILE || path.join(os.tmpdir(), 'kinetic-alert-state.json')

async function getJson(url, timeoutMs = 5000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  const body = await r.json().catch(() => ({}))
  return { status: r.status, body }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}

function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)) } catch { /* tmp không ghi được — chấp nhận */ }
}

async function sendTelegram(text) {
  if (!TOKEN || !CHAT) {
    console.error(`[ALERT] ${text}`)
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error(`[ALERT] Telegram gửi thất bại (${e.message}) — nội dung: ${text}`)
  }
}

function inCooldown(key, state) {
  const last = state[key]
  if (!last) return false
  return Date.now() - last < COOLDOWN_MIN * 60_000
}

async function main() {
  const problems = []

  // 1. liveness — process chết là vấn đề lớn nhất
  try {
    const { status } = await getJson(`${API}/healthz`)
    if (status !== 200) problems.push(`healthz trả ${status} — process sống nhưng lỗi`)
  } catch (e) {
    problems.push(`KHÔNG TỚI ĐƯỢC APP (${e.message}) — server chết hoặc mạng đứt`)
  }

  // 2. readiness — DB chết = không bán được hàng
  try {
    const { status, body } = await getJson(`${API}/readyz`)
    if (status !== 200) problems.push(`readyz ${status}: DB/cache lỗi — ${body?.error || 'không rõ'}`)
  } catch (e) {
    problems.push(`readyz không phản hồi: ${e.message}`)
  }

  // 3. metrics — jobs kẹt + AI error rate
  try {
    const { body: m } = await getJson(`${API}/metrics`)
    const failed = m?.jobs?.failed ?? 0
    if (failed >= JOBS_FAILED_MAX) problems.push(`jobs failed = ${failed} (ngưỡng ${JOBS_FAILED_MAX}) — xem admin jobs`)
    const ai = m?.ai
    if (ai && typeof ai.calls === 'number' && ai.calls > 0) {
      const rate = (ai.errors || 0) / ai.calls
      if (rate >= AI_ERROR_RATE) problems.push(`AI error rate ${(rate * 100).toFixed(0)}% (${ai.errors}/${ai.calls} calls)`)
    }
  } catch { /* metrics chết đã bị healthz/readyz bắt */ }

  if (problems.length === 0) {
    console.log(`[OK] ${new Date().toISOString()} mọi check ổn`)
    return 0
  }

  const state = loadState()
  const fresh = problems.filter((p) => !inCooldown(p, state))
  for (const p of problems) state[p] = Date.now()
  saveState(state)

  if (fresh.length) {
    const msg = [`🔴 <b>KINETIC ALERT</b> ${new Date().toISOString()}`, '', ...fresh.map((p) => `• ${p}`)].join('\n')
    await sendTelegram(msg)
    console.error(`[ALERT] ${fresh.length} vấn đề mới (đã gửi/log)`)
    return 1
  } else {
    console.error(`[ALERT] ${problems.length} vấn đề nhưng trong cooldown ${COOLDOWN_MIN}p — không spam`)
    return 1 // vẫn exit 1 để compose/CronJob thấy unhealthy
  }
}

// test import được main mà không trigger chạy — __main() return exit code
module.exports = { __main: main }

if (require.main === module) {
  main().catch((e) => {
    console.error(`[ALERT] chính nó lỗi: ${e.message}`)
    process.exit(1)
  }).then((code) => { if (code) process.exit(code) })
}
