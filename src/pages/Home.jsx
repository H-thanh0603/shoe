import Hero from '../components/Hero.jsx'
import Marquee from '../components/Marquee.jsx'
import WeatherStrip from '../components/WeatherStrip.jsx'
import ShopByMood from '../components/ShopByMood.jsx'
import FeaturedStrip from '../components/FeaturedStrip.jsx'
import TechLab from '../components/TechLab.jsx'
import Collections from '../components/Collections.jsx'
import Lookbook from '../components/Lookbook.jsx'
import Drop from '../components/Drop.jsx'

export default function Home({ onQuiz, secret, onToggleCompare, compareIds }) {
  return (
    <main>
      <Hero onQuiz={onQuiz} />
      <Marquee secret={secret} />
      <WeatherStrip />
      <ShopByMood />
      <FeaturedStrip onToggleCompare={onToggleCompare} compareIds={compareIds} />
      <TechLab />
      <Collections />
      <Lookbook />
      <Drop />
    </main>
  )
}
