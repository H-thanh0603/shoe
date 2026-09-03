import { useEffect, useState } from 'react'

// Hash router tối giản: #/san-pham/:slug → slug, còn lại → null (trang chủ)
export function useHashRoute() {
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const fn = () => { setRoute(location.hash); window.scrollTo(0, 0) }
    addEventListener('hashchange', fn)
    return () => removeEventListener('hashchange', fn)
  }, [])
  return route.match(/^#\/san-pham\/(.+)/)?.[1] || null
}
