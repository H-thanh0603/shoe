// Mock data — thay bằng API backend khi có. ponytail: hardcode mảng, swap sang fetch khi backend ready.
export const products = [
  { id: 1, name: 'AIR VECTOR 01', brand: 'KINETIC', price: '4,190,000₫', colors: ['#0a0a0a', '#e8e6e1', '#d43a2a'], tag: 'NEW', span: 'wide' },
  { id: 2, name: 'RUN WILD PRO', brand: 'KINETIC', price: '3,850,000₫', colors: ['#1c1c1e', '#d43a2a'], tag: null, span: 'tall' },
  { id: 3, name: 'STREET FLOW', brand: 'KINETIC LAB', price: '2,990,000₫', colors: ['#e8e6e1', '#0a0a0a', '#8a8a8f'], tag: null, span: null },
  { id: 4, name: 'NIGHT PULSE', brand: 'KINETIC', price: '3,450,000₫', colors: ['#0a0a0a', '#d43a2a', '#e8e6e1'], tag: 'LIMITED', span: null },
  { id: 5, name: 'CONCRETE 90', brand: 'KINETIC LAB', price: '2,750,000₫', colors: ['#8a8a8f', '#0a0a0a'], tag: 'SALE', span: 'tall' },
  { id: 6, name: 'HYPER DRIVE X', brand: 'KINETIC', price: '4,650,000₫', colors: ['#d43a2a', '#0a0a0a', '#e8e6e1'], tag: null, span: null },
]

export const collections = [
  { name: 'STREET FUTURE', desc: 'Dark. Metallic. Urban.', bg: 'charcoal' },
  { name: 'NIGHT RUNNER', desc: 'Black. Neon accent. Motion blur.', bg: 'deep' },
  { name: 'RAW MOTION', desc: 'Minimal. White. Editorial.', bg: 'paper', invert: true },
  { name: 'CITY HEAT', desc: 'Concrete. Red accent. High energy.', bg: 'accent' },
]
