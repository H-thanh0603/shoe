// Weather hook (Bước 7.5) — open-meteo no-key, geolocation 8s, cache 30 phút.
// Mọi error → null im lặng: section tự ẩn (plan §Phase 5).
import { useEffect, useState } from 'react'

const KEY = 'weather_v1'
const TTL = 30 * 60 * 1000

const readCache = () => {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY))
    if (c && Date.now() - c.t < TTL) return c
  } catch {}
  return null
}

export function useWeather() {
  const [weather, setWeather] = useState(readCache)

  useEffect(() => {
    let dead = false
    const cache = readCache()
    if (cache) { setWeather(cache); return }

    const fetchWeather = async (lat, lon) => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code`)
        const b = await r.json()
        const cur = { t: Date.now(), cur: b.current }
        try { sessionStorage.setItem(KEY, JSON.stringify(cur)) } catch {}
        if (!dead) setWeather(cur)
      } catch { /* im lặng */ }
    }

    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => !dead && fetchWeather(coords.latitude, coords.longitude),
      () => {},
      { timeout: 8000 },
    )
    return () => { dead = true }
  }, [])

  return weather?.cur || null
}
