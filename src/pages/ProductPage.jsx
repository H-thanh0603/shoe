import ProductDetail from '../components/ProductDetail.jsx'
import { navigate } from '../hooks/useHashRoute.js'

export default function ProductPage({ slug }) {
  return <ProductDetail slug={slug} back={() => { navigate('/') }} />
}
