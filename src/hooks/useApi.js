import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'

// ponytail: fetch đơn giản kèm loading/error — thêm react-query khi cache/invalidate cần thiết
// Envelope unwrap nằm ở lib/api.js, hook chỉ giữ loading/error
export function useApi(url, mapFn) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    apiFetch(url, { signal: ctrl.signal })
      .then((d) => setData(mapFn ? mapFn(d) : d))
      .catch((e) => e.name !== 'AbortError' && setError(e))
    return () => ctrl.abort()
  }, [url])

  return { data, error }
}
