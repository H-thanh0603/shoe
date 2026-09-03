import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Marquee from './components/Marquee.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import Collections from './components/Collections.jsx'
import Drop from './components/Drop.jsx'
import Footer from './components/Footer.jsx'
import CartDrawer from './components/CartDrawer.jsx'

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <ProductGrid />
        <Collections />
        <Drop />
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}
