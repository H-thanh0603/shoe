import { useEffect, useState } from 'react'

// History router tối giản (SEO: URL thật, Google index được — khác hash #/ cũ):
// /san-pham/:slug → { name:'product', param: slug }
// /tra-don[/:code] → { name:'track', param: code|null }
// /admin → { name:'admin' }
// còn lại → { name:'home' }
export function navigate(to) {
  history.pushState(null, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
}

function parse(path) {
  try {
    const r = decodeURIComponent(path).split('?')[0]
    const m = r.match(/^\/san-pham\/(.+)/)
    if (m) return { name: 'product', param: m[1] }
    const t = r.match(/^\/tra-don(?:\/([^/]+))?/)
    if (t) return { name: 'track', param: t[1] || null }
    if (r === '/admin') return { name: 'admin' }
    if (r === '/don-cua-toi') return { name: 'myorders' }
    if (r === '/shop') return { name: 'shop' }
    if (r === '/yeu-thich') return { name: 'wishlist' }
    if (r === '/new') return { name: 'new' }
    if (r === '/bo-suu-tap') return { name: 'collections' }
    const c = r.match(/^\/bo-suu-tap\/(.+)/)
    if (c) return { name: 'collection', param: decodeURIComponent(c[1]) }
    const g = r.match(/^\/gio-hang\/(.+)/)
    if (g) return { name: 'claim', param: decodeURIComponent(g[1]) }
    return { name: 'home' }
  } catch {
    return { name: 'home' }
  }
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parse(location.pathname))
  useEffect(() => {
    const fn = () => { setRoute(parse(location.pathname)); window.scrollTo(0, 0) }
    addEventListener('popstate', fn)
    return () => removeEventListener('popstate', fn)
  }, [])
  return route
}
