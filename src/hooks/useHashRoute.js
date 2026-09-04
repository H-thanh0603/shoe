import { useEffect, useState } from 'react'

// Hash router tối giản:
// #/san-pham/:slug → { name:'product', param: slug }
// #/tra-don[/:code] → { name:'track', param: code|null }
// #/admin → { name:'admin' }
// còn lại → { name:'home' }
export function useHashRoute() {
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const fn = () => { setRoute(location.hash); window.scrollTo(0, 0) }
    addEventListener('hashchange', fn)
    return () => removeEventListener('hashchange', fn)
  }, [])

  const m = route.match(/^#\/san-pham\/(.+)/)
  if (m) return { name: 'product', param: m[1] }
  const t = route.match(/^#\/tra-don(?:\/([^/]+))?/)
  if (t) return { name: 'track', param: t[1] ? decodeURIComponent(t[1]) : null }
  if (route === '#/admin') return { name: 'admin' }
  if (route === '#/don-cua-toi') return { name: 'myorders' }
  if (route === '#/shop') return { name: 'shop' }
  if (route === '#/new') return { name: 'new' }
  if (route === '#/bo-suu-tap') return { name: 'collections' }
  const c = route.match(/^#\/bo-suu-tap\/(.+)/)
  if (c) return { name: 'collection', param: decodeURIComponent(c[1]) }
  const g = route.match(/^#\/gio-hang\/(.+)/)
  if (g) return { name: 'claim', param: decodeURIComponent(g[1]) }
  return { name: 'home' }
}
