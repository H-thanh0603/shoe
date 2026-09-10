// Set document.title + canonical theo route — SEO + tab dễ nhận diện.
// History router: mỗi URL thật cần 1 canonical riêng (tránh duplicate content khi có query/utm).
import { useEffect } from 'react'

export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    let link = document.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      document.head.appendChild(link)
    }
    link.href = `${location.origin}${location.pathname}`
    return () => { document.title = prev }
  }, [title])
}
