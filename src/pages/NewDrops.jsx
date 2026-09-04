import ProductGrid from '../components/ProductGrid.jsx'

export default function NewDrops({ onToggleCompare, compareIds }) {
  return (
    <main className="pt-16">
      <ProductGrid
        onToggleCompare={onToggleCompare}
        compareIds={compareIds}
        preset={{ onlyNew: true, sortBy: 'new' }}
        kicker="NEW // VỪA VỀ"
        heading="HÀNG MỚI VỀ"
      />
    </main>
  )
}
