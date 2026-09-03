import { useState } from 'react'
import { playTechClick } from '../lib/sound.js'

export default function CompareDrawer({ items = [], onRemove, onClear, open, setOpen }) {
  if (items.length === 0) return null

  return (
    <>
      {/* Floating pill dock to open comparator */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-40 animate-slideUp">
          <button
            onClick={() => {
              setOpen(true)
              playTechClick()
            }}
            className="flex items-center gap-3 rounded-full border border-accent bg-ink-deep px-5 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md hover:bg-charcoal transition-all"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-ink">
              {items.length}
            </span>
            <span className="font-display text-xs font-bold tracking-wider text-paper">
              BẢNG SO SÁNH GIÀY
            </span>
            <span className="text-accent">↑</span>
          </button>
        </div>
      )}

      {/* Full Compare Drawer Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/75 backdrop-blur-md animate-fadeIn">
          <div className="relative max-h-[85vh] w-full overflow-y-auto border-t border-white/20 bg-charcoal p-6 shadow-2xl md:p-8 animate-slideUp">
            {/* Header */}
            <div className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-accent uppercase tracking-widest">// MATRIX //</span>
                <h3 className="font-display text-lg font-bold text-paper">SO SÁNH THÔNG SỐ SNEAKER</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClear}
                  className="font-mono text-xs text-paper/50 hover:text-accent transition-colors"
                >
                  XÓA TẤT CẢ
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded border border-white/20 px-3 py-1 font-mono text-xs text-paper/70 hover:border-white hover:text-paper"
                >
                  ĐÓNG ✕
                </button>
              </div>
            </div>

            {/* Comparison Matrix Table */}
            <div className="mx-auto mt-6 max-w-7xl overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-4 text-paper/40 w-44">THÔNG SỐ</th>
                    {items.map((p) => (
                      <th key={p.id} className="py-4 px-4 min-w-[220px]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] text-accent">{p.brand}</span>
                            <p className="font-display text-sm font-bold text-paper">{p.name}</p>
                            <p className="text-accent font-semibold mt-1">{p.price}</p>
                          </div>
                          <button
                            onClick={() => onRemove(p.id)}
                            className="text-paper/40 hover:text-accent text-sm"
                            title="Xóa khỏi bảng"
                          >
                            ✕
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-3 text-paper/50">MỤC ĐÍCH</td>
                    {items.map((p) => (
                      <td key={p.id} className="py-3 px-4 font-bold text-paper uppercase">
                        {p.purpose || 'DAILY'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 text-paper/50">ĐỘ BỀN (DURABILITY)</td>
                    {items.map((p) => (
                      <td key={p.id} className="py-3 px-4 text-paper">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded bg-white/10 overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${p.durability || 80}%` }} />
                          </div>
                          <span>{p.durability || 80}%</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 text-paper/50">ĐỘ ÊM (COMFORT)</td>
                    {items.map((p) => (
                      <td key={p.id} className="py-3 px-4 text-paper">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded bg-white/10 overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${p.comfort || 85}%` }} />
                          </div>
                          <span>{p.comfort || 85}%</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 text-paper/50">HIỆU NĂNG (PERF)</td>
                    {items.map((p) => (
                      <td key={p.id} className="py-3 px-4 text-paper">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded bg-white/10 overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${p.perf || 75}%` }} />
                          </div>
                          <span>{p.perf || 75}%</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 text-paper/50">TÍNH NĂNG ĐẶC BIỆT</td>
                    {items.map((p) => (
                      <td key={p.id} className="py-3 px-4 text-paper/70">
                        {p.tags?.length > 0 ? p.tags.join(', ') : 'Tiêu chuẩn'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-4 text-paper/50">MUA HÀNG</td>
                    {items.map((p) => (
                      <td key={p.id} className="py-4 px-4">
                        <a
                          href={`#/san-pham/${p.slug}`}
                          onClick={() => setOpen(false)}
                          className="inline-block border border-accent bg-accent px-4 py-2 text-center font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent transition-colors"
                        >
                          XEM CHI TIẾT →
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
