import { useEffect, useState } from 'react'
import { useProfile, applyAccent } from './store/profile.js'
import { useHashRoute } from './hooks/useHashRoute.js'
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
import Admin from './pages/Admin.jsx'

export default function App() {
  const route = useHashRoute()
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
      ) : route.name === 'admin' ? (
        <Admin />
      ) : (
        <Home
          onQuiz={openQuiz}
          secret={secret}
          onToggleCompare={compare.toggle}
          compareIds={compare.ids}
        />
      )}

      <Footer />
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
