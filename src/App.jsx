import { useEffect, useState } from 'react'
import { useProfile, applyAccent } from './store/profile.js'
import { useKonami } from './hooks/useKonami.js'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Marquee from './components/Marquee.jsx'
import WeatherStrip from './components/WeatherStrip.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import Collections from './components/Collections.jsx'
import Drop from './components/Drop.jsx'
import Footer from './components/Footer.jsx'
import CartDrawer from './components/CartDrawer.jsx'
import ProductDetail from './components/ProductDetail.jsx'
import Quiz from './components/Quiz.jsx'

// ponytail: hash router 1 dòng — đổi react-router khi có >3 trang thật
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
  // secret mode — sessionStorage: sống sót hash nav, mất khi đóng tab
  const [secret, setSecret] = useState(() => { try { return sessionStorage.getItem('secret_v1') === '1' } catch { return false } })
  const toggleSecret = () => {
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
      <Nav onQuiz={openQuiz} onLogoTap={toggleSecret} secret={secret} />
      {slug ? (
        <ProductDetail slug={slug} back={() => { location.hash = '' }} />
      ) : (
        <main>
          <Hero onQuiz={openQuiz} />
          <Marquee secret={secret} />
          <WeatherStrip />
          <ProductGrid />
          <Collections />
          <Drop />
        </main>
      )}
      <Footer />
      <CartDrawer />
      {quiz && <Quiz onClose={() => setQuiz(false)} />}
    </>
  )
}
