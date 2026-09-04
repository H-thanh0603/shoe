import { useEffect, useRef, useState } from 'react'
import { useAnimeReveal } from '../hooks/useAnimeReveal.js'
import { playTechClick } from '../lib/sound.js'

const LOOKS = [
  {
    id: 'look-1',
    title: 'CYBER DOWNTOWN // HANOI',
    location: '21.0285° N, 105.8542° E',
    category: 'NIGHT',
    desc: 'Áo khoác gió techwear, quần túi hộp ripstop phản quang và AIR VECTOR 01.',
    shoe: {
      name: 'AIR VECTOR 01',
      slug: 'air-vector-01',
      price: '4.190.000₫',
      colors: ['#0a0a0a', '#d43a2a'],
    },
    bgGradient: 'from-zinc-900 via-neutral-900 to-black',
    accent: '#d43a2a',
    coords: { top: '65%', left: '48%' },
  },
  {
    id: 'look-2',
    title: 'TEMPO ATTACK // SHIBUYA',
    location: '35.6595° N, 139.7004° E',
    category: 'RUN',
    desc: 'Set chạy rạng đông: vớ nén thể thao bứt tốc cùng RUN WILD PRO carbon.',
    shoe: {
      name: 'RUN WILD PRO',
      slug: 'run-wild-pro',
      price: '3.850.000₫',
      colors: ['#1c1c1e', '#d43a2a'],
    },
    bgGradient: 'from-stone-900 via-zinc-900 to-neutral-950',
    accent: '#9be15d',
    coords: { top: '68%', left: '52%' },
  },
  {
    id: 'look-3',
    title: 'RAW MINIMAL // CONCRETE GALLERY',
    location: '37.5665° N, 126.9780° E',
    category: 'URBAN',
    desc: 'Outfit đơn sắc, phom dáng kiến trúc tối giản và STREET FLOW da trắng.',
    shoe: {
      name: 'STREET FLOW',
      slug: 'street-flow',
      price: '2.990.000₫',
      colors: ['#e8e6e1', '#0a0a0a'],
    },
    bgGradient: 'from-neutral-900 via-zinc-900 to-stone-950',
    accent: '#5db4ff',
    coords: { top: '62%', left: '45%' },
  },
]

export default function Lookbook() {
  const [activePin, setActivePin] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && e.target.classList.add('is-in'),
      { threshold: 0.1 },
    )
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  useAnimeReveal(ref)

  return (
    <section ref={ref} className="reveal border-t border-white/10 bg-ink py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end mb-12">
          <div>
            <span data-anime className="font-mono text-xs tracking-widest text-accent uppercase">
              LOOKBOOK // ON-FOOT IN THE WILD
            </span>
            <h2 data-anime className="display-l mt-2 text-paper">
              PHỐI ĐỒ <span className="text-accent">ĐƯỜNG PHỐ</span>
            </h2>
          </div>
          <p data-anime className="max-w-md font-mono text-xs text-paper/50">
            Xem cách cộng đồng KINETIC diện giày trong đời thực. Chạm vào điểm ghim trên ảnh để xem chi tiết outfit.
          </p>
        </div>

        {/* Look Cards Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {LOOKS.map((item) => (
            <div
              key={item.id}
              className={`group relative flex min-h-[480px] flex-col justify-between overflow-hidden border border-white/10 bg-gradient-to-b ${item.bgGradient} p-6 transition-all duration-300 hover:border-accent/60`}
            >
              {/* Background Streetwear Vector Graphic & Silhouette */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40">
                <svg viewBox="0 0 400 600" className="h-full w-full object-cover" aria-hidden="true">
                  {/* Cyber grid lines */}
                  <line x1="50" y1="0" x2="50" y2="600" stroke="#ffffff10" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="350" y1="0" x2="350" y2="600" stroke="#ffffff10" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="0" y1="300" x2="400" y2="300" stroke="#ffffff10" strokeWidth="1" strokeDasharray="4 4" />
                  {/* Stylized human figure silhouette wearing sneakers */}
                  <path
                    d="M200 120 C 190 120 180 130 180 145 C 180 160 190 170 200 170 C 210 170 220 160 220 145 C 220 130 210 120 200 120 Z"
                    fill="#3f3f46"
                  />
                  {/* Torso & Tech jacket */}
                  <path
                    d="M160 180 L240 180 L250 320 L150 320 Z"
                    fill="#27272a"
                  />
                  {/* Cargo Pants */}
                  <path
                    d="M160 320 L195 440 L180 490 L150 490 L155 320 Z"
                    fill="#18181b"
                  />
                  <path
                    d="M240 320 L205 440 L220 490 L250 490 L245 320 Z"
                    fill="#18181b"
                  />
                </svg>
              </div>

              {/* Top card metadata */}
              <div className="relative z-10 flex items-center justify-between font-mono text-[10px] tracking-widest text-paper/50">
                <span>{item.location}</span>
                <span className="border border-white/15 px-2 py-0.5 uppercase text-paper/70">
                  {item.category}
                </span>
              </div>

              {/* Interactive Tag Hotpin on the sneaker */}
              <div
                className="absolute z-20"
                style={{ top: item.coords.top, left: item.coords.left }}
              >
                <button
                  onClick={() => {
                    setActivePin(activePin === item.id ? null : item.id)
                    playTechClick()
                  }}
                  aria-label={`Xem giày ${item.shoe.name}`}
                  className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent text-ink shadow-lg transition-transform hover:scale-125"
                >
                  <span className="absolute h-full w-full rounded-full bg-accent animate-ping opacity-40" />
                  <span className="text-base font-bold leading-none">+</span>
                </button>

                {/* Popover Card */}
                {activePin === item.id && (
                  <div className="absolute top-10 -left-20 z-30 w-52 rounded border border-accent/60 bg-ink-deep p-3 shadow-2xl backdrop-blur-md animate-fadeIn">
                    <p className="font-mono text-[9px] tracking-widest text-accent">SẢN PHẨM TRONG HÌNH</p>
                    <p className="mt-1 font-display text-xs font-bold text-paper">{item.shoe.name}</p>
                    <p className="font-mono text-xs font-semibold text-paper/80">{item.shoe.price}</p>
                    <a
                      href={`#/san-pham/${item.shoe.slug}`}
                      className="mt-2.5 block w-full bg-accent py-1.5 text-center font-mono text-[10px] font-bold tracking-widest text-ink hover:bg-white transition-colors"
                    >
                      XEM NGAY →
                    </a>
                  </div>
                )}
              </div>

              {/* Bottom Card Title & Story */}
              <div className="relative z-10 border-t border-white/10 pt-4 backdrop-blur-[2px]">
                <h3 className="font-display text-lg font-bold text-paper">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-paper/60 font-sans">
                  {item.desc}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <a
                    href={`#/san-pham/${item.shoe.slug}`}
                    className="font-mono text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                  >
                    MUA OUTFIT NÀY →
                  </a>
                  <div className="flex gap-1">
                    {item.shoe.colors.map((c) => (
                      <span key={c} className="h-2 w-2 rounded-full border border-white/30" style={{ background: c }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
