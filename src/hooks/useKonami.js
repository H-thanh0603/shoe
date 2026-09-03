// Konami (Bước 7.6) — ↑↑↓↓←→←→ + b + a → callback.
// Guard input/textarea: gõ form checkout không trigger.
import { useEffect } from 'react'

const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

export function useKonami(onUnlock) {
  useEffect(() => {
    let buf = []
    const onKey = (e) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      buf = [...buf, e.key].slice(-SEQ.length)
      if (buf.join('|') === SEQ.join('|')) { buf = []; onUnlock() }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onUnlock])
}
