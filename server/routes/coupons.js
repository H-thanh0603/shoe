// POST /api/v1/coupons/validate — preview giảm giá realtime ở checkout.
// Không trừ lượt dùng ở đây (chỉ khi tạo order). Giá trị tính bằng cùng
// services/pricing với checkout nên preview khớp total thật.
const express = require('express')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { asyncHandler, httpError } = require('../middleware/errorHandler.js')
const { couponDiscount, shippingFee } = require('../services/pricing.js')
const { z } = require('zod')

const router = express.Router()

router.post('/validate', validate(z.object({
  code: z.string().trim().min(1).max(50),
  subtotal: z.number().int().min(0),
})), asyncHandler(async (req, res) => {
  const userId = req.user?.id ?? null // attachUser gắn khi có cookie, route public
  const { rows: [c] } = await pool.query(
    `SELECT c.*, COUNT(cu.order_id) AS used_count,
            COUNT(cu.order_id) FILTER (WHERE o.user_id = $2) AS user_used_count
     FROM coupons c
     LEFT JOIN coupon_usages cu ON cu.coupon_id = c.id
     LEFT JOIN orders o ON o.id = cu.order_id
     WHERE c.code = $1 GROUP BY c.id`,
    [req.body.code.trim(), userId],
  )
  if (!c) throw httpError(400, 'COUPON_NOT_FOUND', 'Mã giảm giá không tồn tại')

  let discount = 0
  let freeShipping = false
  try {
    ;({ discount, freeShipping } = couponDiscount(c, req.body.subtotal, userId))
  } catch (e) {
    throw httpError(e.status || 400, e.code || 'COUPON_INVALID', e.message)
  }

  const shippingFeeVnd = shippingFee(req.body.subtotal, freeShipping)
  res.json({
    success: true,
    data: {
      code: c.code,
      type: c.type,
      discountVnd: discount,
      freeShipping,
      shippingFeeVnd,
      totalVnd: Math.max(req.body.subtotal - discount + shippingFeeVnd, 0),
    },
  })
}))

module.exports = router
