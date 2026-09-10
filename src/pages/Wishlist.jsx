import { useApi } from '../hooks/useApi.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { useProfile } from '../store/profile.js'
import { matchScore } from '../lib/match.js'
import { Card } from '../components/ProductCard.jsx'

// Trang Yêu thích: guest xem wishlist localStorage, login xem server (useWishlist
// đã đồng bộ cả 2 phía). Lọc danh sách product theo ids, sort cũ nhất trước.
export default function Wishlist({ onToggleCompare, compareIds = [] }) {
  const { data: products, error } = useApi('/products?limit=100')
  const { wishlist, toggle, serverMode } = useWishlist()
  const { profile } = useProfile()

  // giữ thứ tự tim (id mới nhất cuối) — map id → product rồi lọc
  const items = (products ?? []).filter((p) => wishlist.includes(p.id))
  items.sort((a, b) => wishlist.indexOf(a.id) - wishlist.indexOf(b.id))

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 pb-20 pt-24 md:px-8">
      <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-accent">
        {serverMode ? 'ĐÃ ĐỒNG BỘ TÀI KHOẢN' : 'LƯU TRÊN THIẾT BỊ NÀY'}
      </p>
      <h1 className="display-l mt-3 text-paper">
        YÊU THÍCH<br />
        <span className="text-paper/30">{wishlist.length} ĐÔI</span>
      </h1>
      {!serverMode && wishlist.length > 0 && (
        <p className="mt-4 max-w-md text-sm text-paper/60">
          Đăng nhập để lưu danh sách này lên tài khoản — không mất khi đổi máy.
        </p>
      )}

      {error && <p className="mt-10 text-sm text-paper/50">Không tải được sản phẩm — kiểm tra server backend.</p>}

      {!error && wishlist.length === 0 && (
        <div className="mt-10 flex flex-col items-center justify-center border border-dashed border-white/15 bg-charcoal/40 px-4 py-20 text-center">
          <svg className="mb-4 h-12 w-12 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <h2 className="font-display text-lg font-bold text-paper">CHƯA CÓ ĐÔI NÀO ĐƯỢC THÍCH</h2>
          <p className="mt-2 max-w-sm font-mono text-xs text-paper/50">
            Bấm biểu tượng tim trên từng giày để lưu lại đây — size sắp hết sẽ hiện badge trên card.
          </p>
          <a
            href="#/shop"
            className="mt-6 border border-accent bg-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-ink transition-colors hover:bg-transparent hover:text-accent"
          >
            KHÁM PHÁ SHOP →
          </a>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map((p) => (
            <Card
              key={p.id}
              p={p}
              match={profile && matchScore(profile, p)?.pct}
              onWishlist={toggle}
              isWishlisted
              onToggleCompare={onToggleCompare}
              isCompared={compareIds.includes(p.id)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
