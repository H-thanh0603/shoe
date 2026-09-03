import { createContext, useContext, useEffect, useReducer } from 'react'
import { track } from '../lib/track.js'
import { apiFetch } from '../lib/api.js'

// Cart client state — server là source of truth (§17), context chỉ giữ bản hiển thị
const CartContext = createContext(null)

function reducer(state, action) {
  switch (action.type) {
    case 'set': return action.cart
    case 'open': return { ...state, open: true }
    case 'close': return { ...state, open: false }
    default: return state
  }
}

const api = (path, opts) => apiFetch(`/cart${path}`, opts)

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(reducer, { items: [], count: 0, totalVnd: 0, open: false })

  useEffect(() => {
    api('/').then((c) => dispatch({ type: 'set', cart: { ...c, open: false } })).catch(() => {})
  }, [])

  const actions = {
    add: (variantId, qty = 1) => api('/items', { method: 'POST', body: JSON.stringify({ variantId, qty }) })
      .then((c) => { dispatch({ type: 'set', cart: { ...c, open: true } }); track('cart_add') }),
    setQty: (itemId, qty) => api(`/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ qty }) })
      .then((c) => dispatch({ type: 'set', cart: { ...c, open: true } })),
    remove: (itemId) => api(`/items/${itemId}`, { method: 'DELETE' })
      .then((c) => dispatch({ type: 'set', cart: { ...c, open: cart.open } })),
    clear: () => api('/', { method: 'DELETE' })
      .then((c) => dispatch({ type: 'set', cart: { ...c, open: cart.open } })),
    open: () => dispatch({ type: 'open' }),
    close: () => dispatch({ type: 'close' }),
  }

  return <CartContext.Provider value={{ cart, ...actions }}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
