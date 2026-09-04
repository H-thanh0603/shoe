// Logic giá dùng chung cho checkout — tách khỏi route để test được mà không cần DB/HTTP.
const FREE_SHIPPING_MIN = 2_000_000
const SHIPPING_FEE = 30_000

// tính discount từ coupon record + subtotal. Trả {discount, freeShipping} hoặc throw lý do.
// userId null (guest) → bỏ qua per_user_limit vì không định danh được.
function couponDiscount(coupon, subtotal, userId = null) {
  if (coupon.status !== 'active') throw Object.assign(new Error('Mã giảm giá không còn hiệu lực'), { status: 400, code: 'COUPON_INACTIVE' })
  const now = new Date()
  if (coupon.starts_at > now) throw Object.assign(new Error('Mã chưa bắt đầu'), { status: 400, code: 'COUPON_NOT_STARTED' })
  if (coupon.expires_at && coupon.expires_at < now) throw Object.assign(new Error('Mã đã hết hạn'), { status: 400, code: 'COUPON_EXPIRED' })
  if (coupon.minimum_order_vnd > subtotal) throw Object.assign(new Error(`Mã áp dụng đơn từ ${coupon.minimum_order_vnd.toLocaleString('vi-VN')}₫`), { status: 400, code: 'COUPON_MIN_ORDER' })
  if (coupon.usage_limit !== null && Number(coupon.used_count) >= coupon.usage_limit) throw Object.assign(new Error('Mã đã hết lượt dùng'), { status: 400, code: 'COUPON_EXHAUSTED' })
  if (userId != null && coupon.per_user_limit != null && Number(coupon.user_used_count || 0) >= coupon.per_user_limit) throw Object.assign(new Error('Bạn đã dùng hết lượt của mã này'), { status: 400, code: 'COUPON_USER_LIMIT' })

  if (coupon.type === 'FREE_SHIPPING') return { discount: 0, freeShipping: true }
  if (coupon.type === 'PERCENTAGE') return { discount: Math.floor((subtotal * coupon.value) / 100), freeShipping: false }
  return { discount: Math.min(coupon.value, subtotal), freeShipping: false } // FIXED
}

function shippingFee(subtotal, freeShipping) {
  return freeShipping || subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE
}

module.exports = { FREE_SHIPPING_MIN, SHIPPING_FEE, couponDiscount, shippingFee }
