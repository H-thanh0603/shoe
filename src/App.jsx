import { useEffect, useState } from 'react'
import { useProfile, applyAccent } from './store/profile.js'
import { useKonami } from './hooks/useKonami.js'
import { track } from './lib/track.js'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Marquee from './components/Marquee.jsx'
import WeatherStrip from './components/WeatherStrip.jsx'
import TechLab from './components/TechLab.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import Lookbook from './components/Lookbook.jsx'
import Collections from './components/Collections.jsx'
import Drop from './components/Drop.jsx'
import Footer from './components/Footer.jsx'
import CartDrawer from './components/CartDrawer.jsx'
import ProductDetail from './components/ProductDetail.jsx'
import Quiz from './components/Quiz.jsx'
import SearchPalette from './components/SearchPalette.jsx'
import CompareDrawer from './components/CompareDrawer.jsx'
import CommunityFeed from './components/CommunityFeed.jsx'

// hash router 1 dòng
const useHashRoute = () => {
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const fn = () => { setRoute(location.hash); window.scrollTo(0, 0) }
    addEventListener('hashchange', fn)
    return () => removeEventListener('hashchange', fn)
  }, [])
  return route.match(/^#\/san-pham\/(.+)/)?.[1] || null
}

export default function App() {
  const slug = useHashRoute()
  const [quiz, setQuiz] = useState(false)
  const openQuiz = () => setQuiz(true)
  const { profile } = useProfile()

  // Search Palette state & Cmd+K handler
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

  // Compare Drawer state
  const [compareItems, setCompareItems] = useState([])
  const [showCompare, setShowCompare] = useState(false)

  const handleToggleCompare = (product) => {
    setCompareItems((prev) => {
      const exists = prev.some((x) => x.id === product.id)
      if (exists) {
        return prev.filter((x) => x.id !== product.id)
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), product]
      }
      return [...prev, product]
    })
  }

  const handleRemoveCompare = (id) => {
    setCompareItems((prev) => prev.filter((x) => x.id !== id))
  }

  const handleClearCompare = () => {
    setCompareItems([])
    setShowCompare(false)
  }

  // secret mode — sessionStorage: sống sót hash nav, mất khi đóng tab
  const [secret, setSecret] = useState(() => {
    try { return sessionStorage.getItem('secret_v1') === '1' } catch { return false }
  })
  const toggleSecret = () => {
    track('secret_mode')
    setSecret((s) => {
      const next = !s
      try { next ? sessionStorage.setItem('secret_v1', '1') : sessionStorage.removeItem('secret_v1') } catch {}
      document.body.classList.toggle('secret', next)
      return next
    })
  }
  useKonami(toggleSecret)

  // áp accent cá nhân hóa từ profile đã lưu (quiz save cũng gọi applyAccent)
  useEffect(() => { applyAccent(profile) }, [profile])
  // áp secret class ngay mount nếu session có
  useEffect(() => { document.body.classList.toggle('secret', secret) }, [])

  return (
    <>
      <Nav
        onQuiz={openQuiz}
        onLogoTap={toggleSecret}
        secret={secret}
        onSearch={() => setShowSearch(true)}
      />

      {slug ? (
        <ProductDetail slug={slug} back={() => { location.hash = '' }} />
      ) : (
        <main>
          <Hero onQuiz={openQuiz} />
          <Marquee secret={secret} />
          <WeatherStrip />
          <ProductGrid
            onToggleCompare={handleToggleCompare}
            compareIds={compareItems.map((x) => x.id)}
          />
          <TechLab />
          <Collections />
          <Lookbook />
          <Drop />
        </main>
      )}

      <Footer />
      <CartDrawer />
      {quiz && <Quiz onClose={() => setQuiz(false)} />}
      <SearchPalette open={showSearch} onClose={() => setShowSearch(false)} />
      <CompareDrawer
        items={compareItems}
        open={showCompare}
        setOpen={setShowCompare}
        onRemove={handleRemoveCompare}
        onClear={handleClearCompare}
      />
      <CommunityFeed />
    </>
  )
}
