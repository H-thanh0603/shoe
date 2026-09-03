import { useState } from 'react'

// Sneaker SVG nghệ thuật kỹ thuật cao (Futuristic Brutalist)
// Hỗ trợ chế độ Exploded / Anatomy bóc tách 4 tầng + Colorway tương tác + Hotspots
export default function HeroShoe({
  colorway = '#d43a2a',
  exploded = false,
  activeHotspot,
  setActiveHotspot,
  onHotspotClick,
}) {
  const [hoveredPart, setHoveredPart] = useState(null)

  const isAnatomy = exploded

  return (
    <div className="relative mx-auto w-full max-w-[620px] select-none">
      {/* Ambient glow phía sau giày theo colorway */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[300px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px] opacity-25 transition-all duration-700"
        style={{ backgroundColor: colorway }}
        aria-hidden="true"
      />

      <svg
        viewBox="0 0 600 320"
        className="relative z-10 w-full overflow-visible drop-shadow-[0_25px_50px_rgba(0,0,0,0.7)]"
        role="img"
        aria-label="KINETIC Air Vector 01 Sneaker Tech Spec"
      >
        <defs>
          {/* Gradients cho từng bộ phận */}
          <linearGradient id="carbonPattern" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1a1c" />
            <stop offset="50%" stopColor="#2c2c30" />
            <stop offset="100%" stopColor="#121214" />
          </linearGradient>

          <linearGradient id="foamGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f4f4f5" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>

          <linearGradient id="soleGripGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colorway} />
            <stop offset="100%" stopColor="#111113" />
          </linearGradient>

          <linearGradient id="upperShade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="70%" stopColor="#d1d1d6" />
            <stop offset="100%" stopColor="#a1a1aa" />
          </linearGradient>

          <pattern id="carbonGrid" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="3" height="3" fill="#18181b" />
            <rect x="3" width="3" height="3" fill="#27272a" />
            <rect y="3" width="3" height="3" fill="#27272a" />
            <rect x="3" y="3" width="3" height="3" fill="#18181b" />
          </pattern>

          <pattern id="upperMesh" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.75" fill="#71717a" opacity="0.3" />
          </pattern>
        </defs>

        {/* --- TẦNG 4: OUTSOLE / ĐẾ NGOÀI (Chuyển động xuống khi Exploded) --- */}
        <g
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: isAnatomy ? 'translateY(42px)' : 'translateY(0px)' }}
          onMouseEnter={() => setHoveredPart('outsole')}
          onMouseLeave={() => setHoveredPart(null)}
        >
          {/* Khung đế ngoài cao su gai bám */}
          <path
            d="M32 248 Q18 266 48 274 L512 274 Q560 268 554 240 L515 220 L76 220 Q48 226 32 248Z"
            fill="url(#soleGripGradient)"
          />
          {/* Gai lốp Hexagonal Traction Treads */}
          <g fill="#09090b" opacity="0.75">
            <rect x="70" y="248" width="18" height="18" rx="3" transform="skewX(-15)" />
            <rect x="110" y="248" width="18" height="18" rx="3" transform="skewX(-15)" />
            <rect x="150" y="248" width="18" height="18" rx="3" transform="skewX(-15)" />
            <rect x="190" y="248" width="18" height="18" rx="3" transform="skewX(-15)" />
            <rect x="230" y="248" width="18" height="18" rx="3" transform="skewX(-15)" />
            <rect x="320" y="248" width="22" height="18" rx="3" transform="skewX(10)" />
            <rect x="365" y="248" width="22" height="18" rx="3" transform="skewX(10)" />
            <rect x="410" y="248" width="22" height="18" rx="3" transform="skewX(10)" />
            <rect x="455" y="248" width="22" height="18" rx="3" transform="skewX(10)" />
          </g>

          {/* Đường chỉ dẫn kỹ thuật khi Exploded */}
          {isAnatomy && (
            <g className="animate-fadeIn">
              <line x1="550" y1="250" x2="610" y2="250" stroke={colorway} strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="618" y="254" fill="var(--color-paper)" fontSize="11" fontFamily="var(--font-display)" fontWeight="600" letterSpacing="0.1em">
                01. VIBRAM® HYPER-GRIP OUTSOLE
              </text>
            </g>
          )}
        </g>

        {/* --- TẦNG 3: CARBON PLATE (Tấm carbon phản lực bóc tách) --- */}
        <g
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: isAnatomy ? 'translateY(18px)' : 'translateY(0px)' }}
          onMouseEnter={() => setHoveredPart('carbon')}
          onMouseLeave={() => setHoveredPart(null)}
        >
          {/* Bản cong sợi Carbon plate 3K */}
          <path
            d="M58 222 Q120 220 220 224 Q360 228 470 200 L504 200 Q440 226 310 226 Q140 226 58 222Z"
            fill="url(#carbonGrid)"
            stroke="#3f3f46"
            strokeWidth="1.5"
          />

          {isAnatomy && (
            <g className="animate-fadeIn">
              <line x1="480" y1="212" x2="610" y2="212" stroke={colorway} strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="618" y="216" fill="var(--color-paper)" fontSize="11" fontFamily="var(--font-display)" fontWeight="600" letterSpacing="0.1em">
                02. 3K TWILL CARBON PLATE
              </text>
            </g>
          )}
        </g>

        {/* --- TẦNG 2: MIDSOLE FOAM (Đệm bọt khí Nitơ) --- */}
        <g
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: isAnatomy ? 'translateY(-10px)' : 'translateY(0px)' }}
          onMouseEnter={() => setHoveredPart('midsole')}
          onMouseLeave={() => setHoveredPart(null)}
        >
          <path
            d="M50 216 Q72 170 180 178 Q300 186 370 174 L490 174 Q525 186 525 216 L490 224 L68 224Z"
            fill="url(#foamGradient)"
            filter="drop-shadow(0 4px 6px rgba(0,0,0,0.3))"
          />
          {/* Cửa sổ đệm khí visible pocket ở gót chân */}
          <rect x="420" y="186" width="60" height="22" rx="6" fill="#18181b" stroke={colorway} strokeWidth="1.5" />
          <circle cx="438" cy="197" r="4" fill={colorway} className="animate-pulse" />
          <circle cx="450" cy="197" r="4" fill={colorway} className="animate-pulse" />
          <circle cx="462" cy="197" r="4" fill={colorway} className="animate-pulse" />

          {/* Đường vân khí động học dập nổi trên midsole */}
          <path d="M120 198 Q190 204 290 200" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M130 206 Q200 212 300 208" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" fill="none" />

          {isAnatomy && (
            <g className="animate-fadeIn">
              <line x1="500" y1="184" x2="610" y2="184" stroke={colorway} strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="618" y="188" fill="var(--color-paper)" fontSize="11" fontFamily="var(--font-display)" fontWeight="600" letterSpacing="0.1em">
                03. NITRO-GEN™ CUSHION FOAM
              </text>
            </g>
          )}
        </g>

        {/* --- TẦNG 1: UPPER & COLLAR (Thân giày Ripstop, dây & chi tiết) --- */}
        <g
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: isAnatomy ? 'translateY(-36px)' : 'translateY(0px)' }}
          onMouseEnter={() => setHoveredPart('upper')}
          onMouseLeave={() => setHoveredPart(null)}
        >
          {/* Thân dệt chính (Upper) */}
          <path
            d="M72 208 Q90 98 220 90 Q330 84 380 125 L456 112 Q508 122 510 188 L460 208 Q350 184 210 188Z"
            fill="url(#upperShade)"
          />
          {/* Vân vải dệt kỹ thuật (Mesh texture) */}
          <path
            d="M72 208 Q90 98 220 90 Q330 84 380 125 L456 112 Q508 122 510 188 L460 208 Q350 184 210 188Z"
            fill="url(#upperMesh)"
          />

          {/* Mũi bọc TPU chống va đập (Toe cap) */}
          <path
            d="M72 208 Q80 156 140 148 L155 198 Q100 204 72 208Z"
            fill="#18181b"
            opacity="0.88"
          />

          {/* Lớp khung gia cố gót (Heel Counter clip) */}
          <path
            d="M450 125 Q490 134 506 178 L475 204 Q440 180 435 140Z"
            fill="#18181b"
          />
          <circle cx="474" cy="155" r="5" fill={colorway} />

          {/* Dải khí động học / Swoosh-like futuristic slash */}
          <path
            d="M100 196 Q240 142 468 184 Q450 196 230 168 Q125 198 100 196Z"
            fill={colorway}
          />

          {/* Hệ thống dây giày Fast-Lock Lacing */}
          <g stroke="#09090b" strokeWidth="5" strokeLinecap="round">
            <line x1="265" y1="104" x2="310" y2="136" />
            <line x1="298" y1="99" x2="344" y2="132" />
            <line x1="334" y1="97" x2="378" y2="128" />
            <line x1="368" y1="98" x2="410" y2="126" />
          </g>

          {/* Mắt xỏ dây phản quang */}
          <g fill="#f4f4f5">
            <circle cx="265" cy="104" r="2.5" />
            <circle cx="298" cy="99" r="2.5" />
            <circle cx="334" cy="97" r="2.5" />
            <circle cx="368" cy="98" r="2.5" />
          </g>

          {/* Cổ giày / Đệm mắt cá chân (Ankle collar) */}
          <path
            d="M380 125 Q415 65 440 68 Q462 72 456 112 Z"
            fill="#18181b"
          />
          {/* Pull tab ở gót giày */}
          <path
            d="M440 68 L450 48 Q458 48 460 60 L456 80 Z"
            fill={colorway}
          />

          {isAnatomy && (
            <g className="animate-fadeIn">
              <line x1="440" y1="62" x2="610" y2="62" stroke={colorway} strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="618" y="66" fill="var(--color-paper)" fontSize="11" fontFamily="var(--font-display)" fontWeight="600" letterSpacing="0.1em">
                04. MONOFILAMENT RIPSTOP UPPER
              </text>
            </g>
          )}
        </g>

        {/* --- INTERACTIVE RADAR HOTSPOTS (Khi không trong chế độ bóc tách) --- */}
        {!isAnatomy && (
          <g className="cursor-pointer">
            {/* Hotspot 1: Heel Cushioning */}
            <g
              transform="translate(450, 196)"
              onClick={() => onHotspotClick?.('cushion')}
              onMouseEnter={() => setActiveHotspot?.('cushion')}
            >
              <circle r="12" fill={colorway} opacity="0.25" className="animate-ping" />
              <circle r="6" fill={colorway} stroke="#ffffff" strokeWidth="2" />
            </g>

            {/* Hotspot 2: Carbon Plate Midfoot */}
            <g
              transform="translate(290, 218)"
              onClick={() => onHotspotClick?.('carbon')}
              onMouseEnter={() => setActiveHotspot?.('carbon')}
            >
              <circle r="12" fill={colorway} opacity="0.25" className="animate-ping" style={{ animationDelay: '300ms' }} />
              <circle r="6" fill={colorway} stroke="#ffffff" strokeWidth="2" />
            </g>

            {/* Hotspot 3: Ripstop Mesh Upper */}
            <g
              transform="translate(200, 140)"
              onClick={() => onHotspotClick?.('upper')}
              onMouseEnter={() => setActiveHotspot?.('upper')}
            >
              <circle r="12" fill={colorway} opacity="0.25" className="animate-ping" style={{ animationDelay: '600ms' }} />
              <circle r="6" fill={colorway} stroke="#ffffff" strokeWidth="2" />
            </g>

            {/* Hotspot 4: Outsole Grip */}
            <g
              transform="translate(110, 258)"
              onClick={() => onHotspotClick?.('traction')}
              onMouseEnter={() => setActiveHotspot?.('traction')}
            >
              <circle r="12" fill={colorway} opacity="0.25" className="animate-ping" style={{ animationDelay: '900ms' }} />
              <circle r="6" fill={colorway} stroke="#ffffff" strokeWidth="2" />
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}
