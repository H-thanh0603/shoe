// VNPay return/IPN — verify chữ ký HMAC SHA512 rồi mới cập nhật payment_status.
// Return (browser redirect): verify xong redirect về SPA #/tra-don/:ref kèm kết quả.
// IPN (server-to-server, cùng handler): trả JSON {RspCode, Message} cho VNPay.
const express = require('express')
const pool = require('../db.js')
const { verifyReturn } = require('../services/vnpay.js')

const router = express.Router()

async function processPayment(query) {
  const v = verifyReturn(query)
  if (!v.ok) return { status: 400, body: { RspCode: '97', Message: 'Chữ ký không hợp lệ' } }
  if (v.responseCode !== '00') return { status: 200, body: { RspCode: '02', Message: 'Đơn chưa thanh toán' } }

  // Idempotent: chỉ unpaid mới update; callback trùng bỏ qua
  const { rows: [updated] } = await pool.query(
    `UPDATE orders SET payment_status = 'paid', payment_txn_ref = $2, status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END
     WHERE id = $1 AND payment_status = 'unpaid'
     RETURNING id, ref_code`,
    [v.orderId, v.transactionNo ? String(v.transactionNo) : String(v.orderId)],
  )
  if (!updated) return { status: 200, body: { RspCode: '00', Message: 'Đơn đã xử lý' } }
  return { status: 200, body: { RspCode: '00', Message: 'Confirm Success', refCode: updated.ref_code } }
}

// Browser redirect từ VNPay → verify rồi đẩy về SPA track order
router.get('/vnpay/return', async (req, res) => {
  const r = await processPayment(req.query)
  const code = r.body.refCode || ''
  const paid = r.body.RspCode === '00'
  res.redirect(302, `/tra-don/${encodeURIComponent(code)}?payment=${paid ? 'ok' : 'fail'}`)
})

// IPN server-to-server — VNPay yêu cầu JSON {RspCode, Message}
router.get('/vnpay/ipn', async (req, res) => {
  const r = await processPayment(req.query)
  res.status(r.status).json(r.body)
})

module.exports = router
