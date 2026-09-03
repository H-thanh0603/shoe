import { useCallback, useEffect, useState } from 'react'
import { useKonami } from './useKonami.js'
import { track } from '../lib/track.js'

// Secret mode — sessionStorage: sống sót hash nav, mất khi đóng tab
export function useSecret() {
  const [secret, setSecret] = useState(() => {
    try { return sessionStorage.getItem('secret_v1') === '1' } catch { return false }
  })

  const toggle = useCallback(() => {
    track('secret_mode')
    setSecret((s) => {
      const next = !s
      try { next ? sessionStorage.setItem('secret_v1', '1') : sessionStorage.removeItem('secret_v1') } catch {}
      document.body.classList.toggle('secret', next)
      return next
    })
  }, [])

  useKonami(toggle)
  useEffect(() => { document.body.classList.toggle('secret', secret) }, [])

  return { secret, toggle }
}
