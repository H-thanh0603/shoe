// node --test src/lib/ — match engine assertions (Bước 7.3)
import test from 'node:test'
import assert from 'node:assert/strict'
import { matchScore, sortProducts } from './match.js'

const P = (over = {}) => ({
  v: 1, purpose: 'running', style: 'future', colors: ['#0a0a0a'], brands: ['ASICS'],
  budget: '2-4m', accent: 'red',
  prefs: { performance: 45, comfort: 25, style: 10, durability: 10, daily: 10 }, ...over,
})
const shoe = (over = {}) => ({
  id: 1, brand: 'ASICS', purpose: 'running', colors: ['#0a0a0a', '#e8e6e1'],
  perf: 80, comfort: 95, style: 70, durability: 85, daily: 88, price_vnd: 3000000, ...over,
})

test('matchScore null khi thiếu prefs hoặc dna', () => {
  assert.equal(matchScore(null, shoe()), null)
  assert.equal(matchScore(P(), { id: 2 }), null) // không dna
})

test('running + comfort cao → score cao, purpose/brand/color boost áp đúng', () => {
  const r = matchScore(P(), shoe())
  // base = (45*80 + 25*95 + 10*70 + 10*85 + 10*88)/100 = 84.05 → 84; +8 purpose +4 brand +4 color
  assert.equal(r.pct, 100)
  assert.ok(r.reasons.length <= 4)
  assert.ok(r.reasons.some((x) => x.includes('mục đích')))
})

test('cap 100', () => {
  const r = matchScore(P(), shoe({ perf: 100, comfort: 100, style: 100, durability: 100, daily: 100 }))
  assert.equal(r.pct, 100)
})

test('sp lệch purpose không nhận boost', () => {
  const r = matchScore(P(), shoe({ purpose: 'trail', brand: 'PUMA', colors: ['#e8e6e1'] }))
  assert.equal(r.pct, 84) // base thuần, 0 boost
  assert.ok(!r.reasons.some((x) => x.includes('mục đích')))
})

test('budget reason xuất hiện khi giá trong tầm', () => {
  const r = matchScore(P(), shoe({ price_vnd: 3500000 }))
  assert.ok(r.reasons.includes('Phù hợp ngân sách'))
  const r2 = matchScore(P(), shoe({ price_vnd: 5500000 }))
  assert.ok(!r2.reasons.includes('Phù hợp ngân sách'))
})

test('sortProducts desc theo score, không profile trả nguyên mảng', () => {
  const lo = shoe({ id: 2, comfort: 60, perf: 50 })
  const hi = shoe({ id: 3 })
  assert.deepEqual(sortProducts(null, [lo, hi]), [lo, hi])
  assert.equal(sortProducts(P(), [lo, hi])[0].id, 3)
})
