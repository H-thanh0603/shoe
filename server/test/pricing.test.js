// Unit test logic giá thuần (không cần DB/server) — Run: npm test trong server/
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { couponDiscount, shippingFee, FREE_SHIPPING_MIN } = require('../services/pricing.js')

const baseCoupon = {
  status: 'active',
  starts_at: new Date(Date.now() - 1000),
  expires_at: new Date(Date.now() + 3600_000),
  minimum_order_vnd: 0,
  usage_limit: null,
  used_count: 0,
  type: 'FIXED',
  value: 100_000,
}

test('FIXED: giảm đúng value, không âm quá subtotal', () => {
  assert.deepEqual(couponDiscount({ ...baseCoupon }, 500_000), { discount: 100_000, freeShipping: false })
  assert.deepEqual(couponDiscount({ ...baseCoupon, value: 999_000 }, 500_000), { discount: 500_000, freeShipping: false })
})

test('PERCENTAGE: làm tròn xuống', () => {
  assert.deepEqual(
    couponDiscount({ ...baseCoupon, type: 'PERCENTAGE', value: 10 }, 555_555),
    { discount: 55_555, freeShipping: false },
  )
})

test('FREE_SHIPPING: discount 0 + freeShip', () => {
  assert.deepEqual(couponDiscount({ ...baseCoupon, type: 'FREE_SHIPPING' }, 100_000), { discount: 0, freeShipping: true })
})

test('coupon hết hạn / chưa bắt đầu / sai min-order ném mã lỗi đúng', () => {
  assert.throws(() => couponDiscount({ ...baseCoupon, status: 'paused' }, 500_000), /không còn hiệu lực/)
  assert.throws(() => couponDiscount({ ...baseCoupon, starts_at: new Date(Date.now() + 1000) }, 500_000), /chưa bắt đầu/)
  assert.throws(() => couponDiscount({ ...baseCoupon, expires_at: new Date(Date.now() - 1000) }, 500_000), /hết hạn/)
  assert.throws(() => couponDiscount({ ...baseCoupon, minimum_order_vnd: 1_000_000 }, 500_000), /áp dụng đơn từ/)
})

test('shippingFee: free khi đủ ngưỡng hoặc có freeShip', () => {
  assert.equal(shippingFee(FREE_SHIPPING_MIN, false), 0)
  assert.equal(shippingFee(100_000, true), 0)
  assert.equal(shippingFee(100_000, false), 30_000)
})
