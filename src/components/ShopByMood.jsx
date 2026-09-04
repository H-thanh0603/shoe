import { useMemo, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useAnimeReveal } from '../hooks/useAnimeReveal.js'

// Dải chọn theo mood rực rỡ — mỗi thẻ dẫn tới đôi hợp nhất của mục đích đó
const MOODS = [
  { id: 'running', label: 'CHẠY BỘ', desc: 'Đệm nảy, carbon', bg: 'from-[#ff5a3c] to-[#ff9a3c]', emoji: '🏃' },
  { id: 'street', label: 'STREET', desc: 'Nổi bật phố', bg: 'from-[#7c5cff] to-[#c86bff]', emoji: '🛹' },
  { id: 'court', label: 'BÓNG RỔ', desc: 'Bám sân, cổ cao', bg: 'from-[#2f9dff] to-[#5ce1ff]', emoji: '🏀' },
  { id: 'daily', label: 'HẰNG NGÀY', desc: 'Êm cả ngày', bg: 'from-[#22b573] to-[#a3e635]', emoji: '🚶' },
  { id: 'trail', label: 'TRAIL', desc: 'Gai sâu, chống nước', bg: 'from-[#b8860b] to-[#f5c542]', emoji: '⛰️' },
]

export default function ShopByMood() {
  const ref = useRef(null)
  const { data: products } = useApi('/products?limit=100')
  useAnimeReveal(ref)

  const picks = useMemo(() => {
    if (!products) return {}
    const out = {}
    for (const m of MOODS) {
      out[m.id] = products.find((p) => p.purpose === m.id)
    }
    return out
  }, [products])

  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20">
      <div className="mb-8 flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <span data-anime className="font-mono text-xs tracking-widest text-accent uppercase">
            CHỌN THEO MOOD //
          </span>
          <h2 data-anime className="display-l mt-1 text-paper">
            HÔM NAY ĐI <span className="text-accent">ĐÂU?</span>
          </h2>
        </div>
        <p data-anime className="max-w-sm font-mono text-xs text-paper/50">
          Mỗi mood một đôi hợp nhất kho — bấm để xem chi tiết.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {MOODS.map((m) => {
          const p = picks[m.id]
          const inner = (
            <>
              <span className="text-3xl" aria-hidden="true">{m.emoji}</span>
              <span className="mt-auto text-left">
                <span className="block font-display text-lg font-bold text-white drop-shadow">{m.label}</span>
                <span className="block font-mono text-[10px] tracking-wider text-white/80">{m.desc}</span>
                {p && <span className="mt-1 block truncate font-mono text-[10px] text-white/90 underline underline-offset-2">{p.name}</span>}
              </span>
            </>
          )
          const cls = `group flex min-h-[190px] flex-col justify-between rounded-2xl bg-gradient-to-br p-4 text-left shadow-lg transition-transform duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${m.bg}`
          return p ? (
            <a key={m.id} data-anime href={`#/san-pham/${p.slug}`} className={cls}>{inner}</a>
          ) : (
            <div key={m.id} data-anime className={`${cls} opacity-80`}>{inner}</div>
          )
        })}
      </div>
    </section>
  )
}
