import { useEffect, useState } from 'react'

// ponytail: fetch đơn giản kèm loading/error — thêm react-query khi cache/invalidate cần thiết
// Envelope: mọi API trả { success, data } — unwrap ở đây, component không biết envelope
export function useApi(url, mapFn) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/v1${url}`, { signal: ctrl.signal })
      .then((r) => r.json().then((body) => (r.ok && body.success ? body.data : Promise.reject(new Error(body?.error?.message || `HTTP ${r.status}`)))))
      .then((d) => setData(mapFn ? mapFn(d) : d))
      .catch((e) => e.name !== 'AbortError' && setError(e))
    return () => ctrl.abort()
  }, [url])

  return { data, error }
}
