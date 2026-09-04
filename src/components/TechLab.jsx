import { useEffect, useRef, useState } from 'react'
import { useAnimeReveal } from '../hooks/useAnimeReveal.js'
import { playTechClick } from '../lib/sound.js'

const LAB_TABS = [
  {
    id: 'foam',
    num: '01',
    name: 'NITRO-GEN™ FOAM',
    category: 'CUSHIONING ARCHITECTURE',
    stat: '+85%',
    statLabel: 'ENERGY RETURN',
    desc: 'Được tiêm khí nitơ siêu tới hạn ở áp suất 120 bar, tạo ra hàng triệu bọt khí siêu nhỏ. Tối đa hóa khả năng hoàn trả lực và chống xẹp lún sau hơn 800km vận hành.',
    badge: 'FLAGSHIP MIDSOLE',
    specs: [
      { k: 'DENSITY', v: '0.16 g/cm³' },
      { k: 'RESILIENCE', v: '85.4%' },
      { k: 'TEMPERATURE RANGE', v: '-20°C ~ +50°C' },
    ],
  },
  {
    id: 'carbon',
    num: '02',
    name: '3K DUAL-CURVE CARBON',
    category: 'PROPULSION & STABILITY',
    stat: '3.2X',
    statLabel: 'TORQUE RESISTANCE',
    desc: 'Bản sợi carbon nguyên khối dệt chéo 3K hình muỗng công thái học. Khóa chặt vòm chân, truyền tải 98% lực đẩy từ ngón chân cái xuống mặt đường.',
    badge: 'AERO PROPULSION',
    specs: [
      { k: 'WEAVE PATTERN', v: '3K Twill Carbon' },
      { k: 'TENSILE STRENGTH', v: '4,900 MPa' },
      { k: 'FLEXURAL MODULUS', v: '230 GPa' },
    ],
  },
  {
    id: 'upper',
    num: '03',
    name: 'MONO-RIPSTOP MESH',
    category: 'UPPER TEXTILE SYSTEM',
    stat: '180G',
    statLabel: 'MONOFILAMENT UPPER',
    desc: 'Cấu trúc dệt một mảnh liền mạch từ sợi polyester cường độ cao. Chống rách xé bề mặt, thoát hơi ẩm tức thì và có lớp phủ DWR kháng nước mưa đô thị.',
    badge: 'WEATHER READY',
    specs: [
      { k: 'WATER REPELLENCY', v: 'DWR Hydrophobic' },
      { k: 'AIR PERMEABILITY', v: '180 cm³/cm²/s' },
      { k: 'SEAMLESS ZONE', v: '100% Zero-Chafe' },
    ],
  },
  {
    id: 'outsole',
    num: '04',
    name: 'HYPER-HEX VIBRAM®',
    category: 'TRACTION & TREAD',
    stat: '0.88',
    statLabel: 'WET FRICTION COEFF',
    desc: 'Hợp chất cao su Megagrip kết hợp hình học gai lục giác bất đối xứng. Độ bám tuyệt đối trên bề mặt bê tông ướt, vạch kẻ đường trơn và đá ẩm ướt.',
    badge: 'ALL-WEATHER GRIP',
    specs: [
      { k: 'LUG DEPTH', v: '4.5 mm' },
      { k: 'COMPOUND', v: 'Vibram Megagrip' },
      { k: 'SIPING PATTERN', v: 'Multi-Directional' },
    ],
  },
]

export default function TechLab() {
  const [activeTab, setActiveTab] = useState(LAB_TABS[0].id)
  const ref = useRef(null)

  const cur = LAB_TABS.find((t) => t.id === activeTab) || LAB_TABS[0]

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
    <section ref={ref} className="reveal border-t border-white/10 bg-ink-deep py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* Section Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span data-anime className="font-mono text-xs tracking-widest text-accent uppercase">
              // SPECIFICATION LAB // 004
            </span>
            <h2 data-anime className="display-l mt-2 text-paper">
              GIẢI PHẪU <span className="text-accent">CÔNG NGHỆ</span>
            </h2>
          </div>
          <p data-anime className="max-w-md font-mono text-xs text-paper/50 leading-relaxed">
            Mỗi chi tiết trên giày KINETIC đều được tính toán theo dữ liệu chuyển động học (Biomechanical data), không thừa bất kỳ gram trọng lượng nào.
          </p>
        </div>

        {/* Interactive Lab Tabs */}
        <div className="mt-12 grid grid-cols-2 gap-2 border-b border-white/10 pb-4 md:grid-cols-4">
          {LAB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                playTechClick()
              }}
              className={`flex flex-col items-start border p-4 text-left transition-all ${
                activeTab === tab.id
                  ? 'border-accent bg-charcoal text-paper shadow-[0_0_20px_rgba(212,58,42,0.15)]'
                  : 'border-white/10 bg-transparent text-paper/60 hover:border-white/30 hover:text-paper'
              }`}
            >
              <span className="font-mono text-[10px] tracking-widest text-accent">
                SPEC {tab.num}
              </span>
              <span className="mt-1 font-display text-sm font-bold tracking-tight text-paper">
                {tab.name}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Detail Showcase */}
        <div className="mt-8 grid items-stretch gap-8 lg:grid-cols-12">
          {/* Main Visual Presentation Box */}
          <div className="relative flex flex-col justify-between overflow-hidden border border-white/10 bg-charcoal p-8 lg:col-span-7">
            {/* Background blueprint grid */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:2rem_2rem]" />

            <div className="relative z-10 flex items-center justify-between">
              <span className="border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-accent">
                {cur.badge}
              </span>
              <span className="font-mono text-xs text-paper/40">SYS // ID-{cur.id.toUpperCase()}</span>
            </div>

            {/* Dynamic Diagram Art */}
            <div className="relative z-10 my-12 flex items-center justify-center">
              {cur.id === 'foam' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative h-32 w-64 rounded-xl border border-accent/40 bg-gradient-to-t from-accent/20 to-transparent p-4 flex items-end justify-around">
                    <div className="h-20 w-8 rounded bg-accent/60 animate-pulse" />
                    <div className="h-24 w-8 rounded bg-accent/80 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="h-28 w-8 rounded bg-accent animate-pulse" style={{ animationDelay: '300ms' }} />
                    <div className="h-16 w-8 rounded bg-accent/50 animate-pulse" style={{ animationDelay: '450ms' }} />
                  </div>
                  <span className="font-mono text-xs text-paper/50 tracking-widest">NITROGEN GAS CELL EXPANSION</span>
                </div>
              )}

              {cur.id === 'carbon' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="h-28 w-72 rounded border border-white/20 bg-[radial-gradient(#ffffff20_1px,transparent_1px)] bg-[size:8px_8px] flex items-center justify-center">
                    <span className="font-mono text-xs tracking-widest text-accent font-bold">
                      3K TWILL WEAVE // 230 GPA
                    </span>
                  </div>
                  <span className="font-mono text-xs text-paper/50 tracking-widest">TORSIONAL RIGIDITY TEST</span>
                </div>
              )}

              {cur.id === 'upper' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative h-28 w-72 border border-white/20 p-4 flex items-center justify-between overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,#ffffff08_25%,transparent_25%,transparent_50%,#ffffff08_50%,#ffffff08_75%,transparent_75%)] bg-[size:16px_16px]" />
                    <span className="relative z-10 font-mono text-xs text-accent font-bold">HYDROPHOBIC DWR</span>
                    <span className="relative z-10 font-mono text-xs text-paper/70">BREATHABLE 360°</span>
                  </div>
                  <span className="font-mono text-xs text-paper/50 tracking-widest">WATER-REPELLENT BARRIER</span>
                </div>
              )}

              {cur.id === 'outsole' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-20 w-10 border border-accent/40 bg-accent/15 transform -skew-x-12 flex items-center justify-center font-mono text-[10px] text-accent">
                        HEX
                      </div>
                    ))}
                  </div>
                  <span className="font-mono text-xs text-paper/50 tracking-widest">VIBRAM MEGAGRIP MULTI-SIPING</span>
                </div>
              )}
            </div>

            {/* Huge Stat Display */}
            <div className="relative z-10 flex items-baseline justify-between border-t border-white/10 pt-6">
              <div>
                <p className="font-mono text-[10px] tracking-widest text-paper/40 uppercase">{cur.statLabel}</p>
                <p className="font-display text-5xl font-extrabold text-accent">{cur.stat}</p>
              </div>
              <span className="font-mono text-[11px] text-paper/50">TESTED IN TOKYO & HANOI LABS</span>
            </div>
          </div>

          {/* Technical Specs & Description Box */}
          <div className="flex flex-col justify-between border border-white/10 bg-charcoal p-8 lg:col-span-5">
            <div>
              <span className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
                {cur.category}
              </span>
              <h3 className="mt-2 font-display text-2xl font-bold text-paper">
                {cur.name}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-paper/70 font-sans">
                {cur.desc}
              </p>

              {/* Spec Table */}
              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="font-mono text-[10px] tracking-widest text-paper/40 mb-4">THÔNG SỐ ĐO LƯỜNG:</p>
                <div className="space-y-3">
                  {cur.specs.map((s) => (
                    <div key={s.k} className="flex items-center justify-between border-b border-white/5 pb-2 font-mono text-xs">
                      <span className="text-paper/50">{s.k}</span>
                      <span className="font-semibold text-paper">{s.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <a
                href="#shop"
                className="block w-full border border-white/20 bg-charcoal-2 py-3.5 text-center font-display text-xs font-bold tracking-widest text-paper transition-colors hover:border-accent hover:text-accent"
              >
                TÌM GIÀY TRANG BỊ CÔNG NGHỆ NÀY →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
