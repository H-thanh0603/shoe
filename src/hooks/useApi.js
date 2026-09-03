import { useEffect, useState } from 'react'

// ponytail: fetch đơn giản kèm loading/error — thêm react-query khi cache/invalidate cần thiết
export function useApi(url, mapFn) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setData(mapFn ? mapFn(d) : d))
      .catch((e) => e.name !== 'AbortError' && setError(e))
    return () => ctrl.abort()
  }, [url])

  return { data, error }
}
