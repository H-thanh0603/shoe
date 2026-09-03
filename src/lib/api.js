// Client API tập trung — mọi fetch /api/v1 đi qua đây.
// Envelope backend: { success, data } / { success:false, error:{code,message} }.
// Unwrap ở đây, component chỉ nhận data hoặc throw Error(message).

const BASE = '/api/v1'

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

export async function apiFetch(path, opts) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    ...(opts?.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}),
  })
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}
