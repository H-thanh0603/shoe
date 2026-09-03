import { playTechClick } from '../lib/sound.js'

export const BRANDS = ['TẤT CẢ', 'KINETIC', 'NIKE', 'ADIDAS', 'NEW BALANCE', 'ASICS', 'PUMA']
export const PURPOSES = [
  { id: 'all', label: 'TẤT CẢ MỤC ĐÍCH' },
  { id: 'running', label: 'CHẠY BỘ' },
  { id: 'street', label: 'STREETWEAR' },
  { id: 'court', label: 'BÓNG RỔ' },
  { id: 'daily', label: 'HẰNG NGÀY' },
  { id: 'trail', label: 'TRAIL / NÚI' },
]

export const PRICE_RANGES = [
  { id: 'all', label: 'TẤT CẢ MỨC GIÁ' },
  { id: 'under-2.5m', label: 'DƯỚI 2.500.000₫', max: 2500000 },
  { id: '2.5m-4m', label: '2.500.000₫ – 4.000.000₫', min: 2500000, max: 4000000 },
  { id: 'above-4m', label: 'TRÊN 4.000.000₫', min: 4000000 },
]

export const QUICK_SEARCH_CHIPS = ['KINETIC', 'AIR VECTOR', 'RUNNING', 'CARBON', 'SALE', 'NEW']

const selectCls = 'border border-white/15 bg-charcoal px-3 py-1 text-xs font-mono text-paper focus:border-accent focus:outline-none'

export function SearchBar({ value, onChange }) {
  return (
    <div className="mb-6">
      <div className="relative flex items-center border border-white/20 bg-charcoal focus-within:border-accent transition-colors">
        <svg
          className="ml-4 h-5 w-5 text-accent shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="TÌM SNEAKER THEO TÊN, THƯƠNG HIỆU, CÔNG NGHỆ (VIBRAM, CARBON, GORE-TEX)..."
          className="w-full bg-transparent px-4 py-3.5 font-mono text-xs uppercase tracking-wider text-paper placeholder:text-paper/30 focus:outline-none md:text-sm"
        />
        {value && (
          <button
            onClick={() => { onChange(''); playTechClick() }}
            className="mr-3 font-mono text-xs text-paper/50 hover:text-paper px-2 py-1"
          >
            XÓA ✕
          </button>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-paper/40">GỢI Ý TÌM NHANH:</span>
        {QUICK_SEARCH_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => { onChange(chip); playTechClick() }}
            className={`font-mono text-[11px] px-2 py-0.5 border rounded-sm transition-all ${
              value.toUpperCase() === chip
                ? 'border-accent bg-accent text-ink font-bold'
                : 'border-white/10 text-paper/60 hover:border-accent hover:text-accent'
            }`}
          >
            #{chip}
          </button>
        ))}
      </div>
    </div>
  )
}

export function FilterBar({ filters, onChange, hasActiveFilters, onReset }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  const btn = (active) => `px-3 py-1 text-xs font-mono font-semibold tracking-wider transition-all ${
    active
      ? 'border border-accent bg-accent text-ink'
      : 'border border-white/10 bg-charcoal text-paper/60 hover:border-white/30 hover:text-paper'
  }`

  return (
    <div className="mb-8 flex flex-col gap-4 border-y border-white/10 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-paper/40 mr-1">HÃNG:</span>
        {BRANDS.map((b) => (
          <button
            key={b}
            onClick={() => { set({ brand: b, page: 1 }); playTechClick() }}
            className={btn(filters.brand === b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-widest text-paper/40">MỤC ĐÍCH:</span>
          <select
            value={filters.purpose}
            onChange={(e) => set({ purpose: e.target.value, page: 1 })}
            className={selectCls}
          >
            {PURPOSES.map((p) => (
              <option key={p.id} value={p.id} className="bg-charcoal text-paper">
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-widest text-paper/40">GIÁ:</span>
          <select
            value={filters.price}
            onChange={(e) => set({ price: e.target.value, page: 1 })}
            className={selectCls}
          >
            {PRICE_RANGES.map((r) => (
              <option key={r.id} value={r.id} className="bg-charcoal text-paper">
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-widest text-paper/40">SẮP XẾP:</span>
          <select
            value={filters.sortBy}
            onChange={(e) => set({ sortBy: e.target.value, page: 1 })}
            className={selectCls}
          >
            <option value="match" className="bg-charcoal text-paper">PHÙ HỢP NHẤT</option>
            <option value="price-asc" className="bg-charcoal text-paper">GIÁ: THẤP ĐẾN CAO</option>
            <option value="price-desc" className="bg-charcoal text-paper">GIÁ: CAO ĐẾN THẤP</option>
            <option value="new" className="bg-charcoal text-paper">MỚI NHẤT</option>
            <option value="name-asc" className="bg-charcoal text-paper">TÊN: A → Z</option>
          </select>
        </div>

        <button
          onClick={() => { set({ onlyNew: !filters.onlyNew, page: 1 }); playTechClick() }}
          className={`border px-3 py-1 text-xs font-mono font-semibold transition-all ${
            filters.onlyNew
              ? 'border-accent bg-accent text-ink'
              : 'border-white/15 bg-charcoal text-paper/60 hover:text-paper'
          }`}
        >
          {filters.onlyNew ? '✓ NEW DROPS' : '+ NEW DROPS'}
        </button>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-mono text-accent hover:bg-accent hover:text-ink transition-all"
          >
            ĐẶT LẠI BỘ LỌC ✕
          </button>
        )}
      </div>
    </div>
  )
}
