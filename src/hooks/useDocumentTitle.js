// Set document.title theo route — SEO + tab dễ nhận diện. Trả về cleanup tự động.
import { useEffect } from 'react'

export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => { document.title = prev }
  }, [title])
}
