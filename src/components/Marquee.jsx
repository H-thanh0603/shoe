// Marquee (DESIGN.md §32) — infinite, hover pause. CSS animation trong index.css.
export default function Marquee() {
  const items = ['MOVE DIFFERENT', 'MOVE DIFFERENT', 'MOVE DIFFERENT', 'MOVE DIFFERENT', 'MOVE DIFFERENT', 'MOVE DIFFERENT']
  return (
    <div className="border-y border-white/10 bg-accent py-3 overflow-hidden" aria-hidden="true">
      <div className="marquee-track gap-0">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex shrink-0">
            {items.map((t, i) => (
              <span key={i} className="font-display text-lg font-bold tracking-widest whitespace-nowrap px-4 text-ink">
                {t} <span className="px-2">—</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
