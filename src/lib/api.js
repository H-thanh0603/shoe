// Client API tập trung — mọi fetch /api/v1 đi qua đây.
// Envelope backend: { success, data } / { success:false, error:{code,message} }.
// Unwrap ở đây, component chỉ nhận data hoặc throw Error(message).
// CSRF double-submit: echo cookie `csrf` qua header X-CSRF-Token trên mutation.
// 401 → thử refresh 1 lần (single-flight) rồi retry request gốc.

const BASE = '/api/v1'

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

async function parseEnvelope(res) {
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = body?.error?.code
    throw err
  }
  return body.data
}

// single-flight refresh: nhiều call 401 cùng lúc → 1 request refresh, share promise
let refreshing = null
async function refreshOnce() {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken() },
      credentials: 'same-origin',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { setTimeout(() => { refreshing = null }, 0) })
  }
  return refreshing
}

export async function apiFetch(path, opts, retried = false) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken(), ...opts?.headers },
    ...(opts?.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}),
  })
  // 401 một lần → refresh → retry; refresh fail thì throw như cũ
  if (res.status === 401 && !path.startsWith('/auth/') && !retried) {
    if (await refreshOnce()) {
      window.dispatchEvent(new CustomEvent('auth-changed')) // wishlist re-sync sau refresh
      return apiFetch(path, opts, true)
    }
  }
  return parseEnvelope(res)
}

export const apiGet = (path, opts) => apiFetch(path, { ...opts, method: 'GET' })
export const apiPost = (path, body, opts) =>
  apiFetch(path, { ...opts, method: 'POST', body })
export const apiPatch = (path, body, opts) =>
  apiFetch(path, { ...opts, method: 'PATCH', body })
export const apiDelete = (path, opts) =>
  apiFetch(path, { ...opts, method: 'DELETE' })

// Fire-and-forget (tracking): không throw, không vỡ app.
export function apiSendBeacon(path, body) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}
