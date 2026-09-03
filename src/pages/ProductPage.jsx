import ProductDetail from '../components/ProductDetail.jsx'

export default function ProductPage({ slug }) {
  return <ProductDetail slug={slug} back={() => { location.hash = '' }} />
}
