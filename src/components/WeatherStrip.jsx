// WeatherStrip (Bước 7.5) — gợi ý theo thời tiết: mưa → RAIN READY,
// nóng ≥30° → KEEP YOUR FEET COOL. Không weather → không render gì.
import { useApi } from '../hooks/useApi.js'
import { useWeather } from '../hooks/useWeather.js'
import { Card } from './ProductGrid.jsx'

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

export default function WeatherStrip() {
  const weather = useWeather()
  const { data: products } = useApi('/products?limit=100')
  if (!weather || !products) return null

  const rain = weather.precipitation > 0 || RAIN_CODES.has(weather.weather_code)
  const hot = !rain && weather.temperature_2m >= 30
  const tag = rain ? 'water-resistant' : hot ? 'breathable' : null
  if (!tag) return null

  const picks = products.filter((p) => p.tags?.includes(tag)).slice(0, 3)
  if (!picks.length) return null

  return (
    <section className="border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs tracking-widest text-paper/40">
              {Math.round(weather.temperature_2m)}°C · {rain ? 'CÓ MƯA' : 'NÓNG'} — GỢI Ý CHO THỜI TIẾT HÔM NAY
            </p>
            <h2 className="display-l text-paper">
              {rain ? 'RAIN' : 'COOL'}<span className="text-accent">{rain ? ' READY' : ' FEET'}</span>
            </h2>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {picks.map((p) => <Card key={p.id} p={p} />)}
        </div>
      </div>
    </section>
  )
}
