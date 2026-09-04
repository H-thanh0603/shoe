import ProductGrid from '../components/ProductGrid.jsx'

export default function Shop({ onToggleCompare, compareIds }) {
  return (
    <main className="pt-16">
      <ProductGrid
        onToggleCompare={onToggleCompare}
        compareIds={compareIds}
        kicker="SHOP // TẤT CẢ"
        heading="CẢ KHO GIÀY"
      />
    </main>
  )
}
