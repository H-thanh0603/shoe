import { useMemo } from 'react'
import { sortProducts } from '../lib/match.js'
import { PRICE_RANGES } from '../components/ProductFilters.jsx'

export const DEFAULT_FILTERS = {
  query: '',
  brand: 'TẤT CẢ',
  purpose: 'all',
  price: 'all',
  onlyNew: false,
  sortBy: 'match',
}

export function hasActiveFilters(f) {
  return (
    f.query.trim() !== '' ||
    f.brand !== 'TẤT CẢ' ||
    f.purpose !== 'all' ||
    f.price !== 'all' ||
    f.onlyNew
  )
}

export function useProductFilter(products, profile, f) {
  return useMemo(() => {
    let list = products || []

    if (f.query.trim()) {
      const q = f.query.toLowerCase().trim()
      list = list.filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.purpose?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q)),
      )
    }

    if (f.brand !== 'TẤT CẢ') {
      list = list.filter((p) => p.brand.toUpperCase() === f.brand)
    }

    if (f.purpose !== 'all') {
      list = list.filter((p) => p.purpose === f.purpose)
    }

    if (f.price !== 'all') {
      const pr = PRICE_RANGES.find((r) => r.id === f.price)
      if (pr) {
        if (pr.min != null) list = list.filter((p) => p.price_vnd >= pr.min)
        if (pr.max != null) list = list.filter((p) => p.price_vnd <= pr.max)
      }
    }

    if (f.onlyNew) {
      list = list.filter((p) => p.tag === 'NEW' || p.tag === 'LIMITED')
    }

    if (f.sortBy === 'match') return sortProducts(profile, list)
    if (f.sortBy === 'price-asc') return [...list].sort((a, b) => a.price_vnd - b.price_vnd)
    if (f.sortBy === 'price-desc') return [...list].sort((a, b) => b.price_vnd - a.price_vnd)
    if (f.sortBy === 'new') return [...list].sort((a, b) => (b.tag === 'NEW' ? 1 : 0) - (a.tag === 'NEW' ? 1 : 0))
    if (f.sortBy === 'name-asc') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [products, profile, f])
}
