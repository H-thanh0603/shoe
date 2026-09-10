import { useRef, useState } from 'react'
import { useAnimeReveal } from '../hooks/useAnimeReveal.js'
import { useScrollReveal } from '../hooks/useScrollReveal.js'
import { playTechClick } from '../lib/sound.js'

const LOOKS = [
  {
    id: 'look-1',
    title: 'CYBER DOWNTOWN // HANOI',
    location: '21.0285° N, 105.8542° E',
    category: 'NIGHT',
    desc: 'Áo khoác gió techwear, quần túi hộp ripstop phản quang và AIR VECTOR 01.',
    video: '/videos/look-1-night.mp4',
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
    video: '/videos/look-2-run.mp4',
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
    video: '/videos/look-3-minimal.mp4',
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

  useScrollReveal(ref)
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
              {/* Video on-foot thật (Mixkit, license free) — autoplay muted loop,
                  chỉ phát khi card vào viewport để tiết kiệm bandwidth */}
              <video
                src={item.video}
                muted
                loop
                playsInline
                preload="none"
                aria-label={`On-foot ${item.title}`}
                className="absolute inset-0 h-full w-full object-cover"
                ref={(el) => {
                  if (!el) return
                  const io = new IntersectionObserver(([e]) => {
                    if (e.isIntersecting) el.play().catch(() => {})
                    else el.pause()
                  }, { threshold: 0.25 })
                  io.observe(el)
                }}
              />

              {/* Lớp tối để text nổi trên video */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />

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
                      href={`/san-pham/${item.shoe.slug}`}
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
                    href={`/san-pham/${item.shoe.slug}`}
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
