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
// Admin hiếm khi vào — tách chunk riêng, không kéo theo trang chủ
const Admin = lazy(() => import('./pages/Admin.jsx'))
import Preloader from './components/Preloader.jsx'
import LiveFeed from './components/LiveFeed.jsx'

export default function App() {
  const route = useHashRoute()
  const TITLES = {
    product: 'Sản phẩm', track: 'Tra cứu đơn hàng', myorders: 'Đơn của tôi',
    shop: 'Shop', new: 'New Drops', wishlist: 'Yêu thích', collections: 'Bộ sưu tập', collection: 'Bộ sưu tập', admin: 'Admin',
  }
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
