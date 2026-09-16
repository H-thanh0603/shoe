import { Suspense, lazy, useEffect, useState } from 'react'
import { useProfile, applyAccent } from './store/profile.js'
import { useHashRoute } from './hooks/useHashRoute.js'
import { useDocumentTitle } from './hooks/useDocumentTitle.js'
import { useCompare } from './hooks/useCompare.js'
import { useSecret } from './hooks/useSecret.js'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import CartDrawer from './components/CartDrawer.jsx'
import Quiz from './components/Quiz.jsx'
import SearchPalette from './components/SearchPalette.jsx'
import CompareDrawer from './components/CompareDrawer.jsx'
import CommunityFeed from './components/CommunityFeed.jsx'
import Home from './pages/Home.jsx'
import ProductPage from './pages/ProductPage.jsx'
import TrackOrder from './pages/TrackOrder.jsx'
import MyOrders from './pages/MyOrders.jsx'
import ClaimCart from './pages/ClaimCart.jsx'
import Shop from './pages/Shop.jsx'
import NewDrops from './pages/NewDrops.jsx'
import Wishlist from './pages/Wishlist.jsx'
import CollectionDetail from './pages/CollectionDetail.jsx'
import Collections from './components/Collections.jsx'
import Policy from './pages/Policy.jsx'
// Admin hiếm khi vào — tách chunk riêng, không kéo theo trang chủ
const Admin = lazy(() => import('./pages/Admin.jsx'))
import Preloader from './components/Preloader.jsx'
import LiveFeed from './components/LiveFeed.jsx'
import ShoppingAssistant from './components/ShoppingAssistant.jsx'

export default function App() {
  const route = useHashRoute()
  const TITLES = {
    track: 'Tra cứu đơn hàng', myorders: 'Đơn của tôi',
    shop: 'Shop', new: 'New Drops', wishlist: 'Yêu thích', collections: 'Bộ sưu tập', collection: 'Bộ sưu tập', admin: 'Admin',
  }
  // Trang sản phẩm: ProductDetail tự set title theo tên giày (SEO từng URL)
  useDocumentTitle(route.name in TITLES ? `KINETIC — ${TITLES[route.name]}` : 'KINETIC — Move Different')
  const [quiz, setQuiz] = useState(false)
  const openQuiz = () => setQuiz(true)
  const { profile } = useProfile()
  const compare = useCompare()
  const { secret, toggle: toggleSecret } = useSecret()

  // Cmd+K / Ctrl+K mở Search Palette
  const [showSearch, setShowSearch] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowSearch((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // áp accent cá nhân hóa từ profile đã lưu (quiz save cũng gọi applyAccent)
  useEffect(() => { applyAccent(profile) }, [profile])

  return (
    <>
      <Preloader />
      {/* Skip-link: keyboard users nhảy thẳng tới nội dung, không phải tab
          qua toàn bộ nav mỗi page (WCAG 2.4.1 Bypass Blocks) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-accent focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:font-bold focus:text-ink"
      >
        TỚI NỘI DUNG
      </a>
      <div className="grain" aria-hidden="true" />
      <Nav
        onQuiz={openQuiz}
        onLogoTap={toggleSecret}
        secret={secret}
        onSearch={() => setShowSearch(true)}
      />

      {route.name === 'product' ? (
        <ProductPage slug={route.param} />
      ) : route.name === 'track' ? (
        <TrackOrder initialCode={route.param} />
      ) : route.name === 'myorders' ? (
        <MyOrders />
      ) : route.name === 'claim' ? (
        <ClaimCart token={route.param} />
      ) : route.name === 'policy' ? (
        <Policy slug={route.param} />
      ) : route.name === 'shop' ? (
        <Shop onToggleCompare={compare.toggle} compareIds={compare.ids} />
      ) : route.name === 'new' ? (
        <NewDrops onToggleCompare={compare.toggle} compareIds={compare.ids} />
      ) : route.name === 'collections' ? (
        <main className="pt-16"><Collections /></main>
      ) : route.name === 'collection' ? (
        <CollectionDetail slug={route.param} onToggleCompare={compare.toggle} compareIds={compare.ids} />
      ) : route.name === 'wishlist' ? (
        <Wishlist onToggleCompare={compare.toggle} compareIds={compare.ids} />
      ) : route.name === 'admin' ? (
        <Suspense fallback={null}><Admin /></Suspense>
      ) : route.name === 'notfound' ? (
        <main className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:pt-32">
          <p className="font-mono text-xs tracking-widest text-accent">404 //</p>
          <h1 className="display-l mt-1 text-paper">KHÔNG TÌM THẤY TRANG<span className="text-accent">.</span></h1>
          <p className="mt-4 text-sm text-paper/60">Địa chỉ này không tồn tại. Quay lại mua sắm nhé.</p>
          <a href="/shop" className="mt-6 inline-block border border-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-accent hover:bg-accent hover:text-ink">MUA SẮM NGAY</a>
        </main>
      ) : (
        <Home
          onQuiz={openQuiz}
          secret={secret}
          onToggleCompare={compare.toggle}
          compareIds={compare.ids}
        />
      )}

      <Footer />
      {route.name !== 'admin' && <LiveFeed />}
      {route.name !== 'admin' && <ShoppingAssistant />}
      <CartDrawer />
      {quiz && <Quiz onClose={() => setQuiz(false)} />}
      <SearchPalette open={showSearch} onClose={() => setShowSearch(false)} />
      <CompareDrawer
        items={compare.items}
        open={compare.open}
        setOpen={compare.setOpen}
        onRemove={compare.remove}
        onClear={compare.clear}
      />
      <CommunityFeed />
    </>
  )
}
