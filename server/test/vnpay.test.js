// Self-check vnpay service — sign/verify roundtrip, không cần DB (test thuần).
// Mô phỏng đúng luồng thật:
//   1) build URL request (hash ký cả vnp_SecureHashType) → parse lại phải verify ok.
//   2) VNPay return: thêm vnp_ResponseCode/TransactionNo rồi VNPay ký LẠI toàn bộ →
//      test dùng vnpay.sign() để dựng hash như VNPay làm → verify phải ok.
//   3) Tamper / thiếu hash → reject.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.VNPAY_TMN_CODE = 'TEST01'
process.env.VNPAY_HASH_SECRET = 'secret123'
const vnpay = require('../services/vnpay.js')

test('vnpay: buildUrl + verify roundtrip + tamper reject', () => {
  assert.equal(vnpay.configured(), true, 'configured')
  const url = vnpay.buildPaymentUrl({ orderId: 42, amountVnd: 500000, ip: '127.0.0.1' })
  assert.ok(url.startsWith('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?'), 'sandbox URL')
  const qs = Object.fromEntries(new URL(url).searchParams)
  assert.equal(qs.vnp_TxnRef, '42', 'txnRef = order id')
  assert.equal(qs.vnp_Amount, '50000000', 'amount x100')
  assert.equal(qs.vnp_SecureHash.length, 128, 'SHA512 hex 128 chars')
  assert.equal(qs.vnp_SecureHashType, 'HmacSHA512', 'hash type trong dữ liệu ký')

  // 1) request URL tự verify (encoding + sign nhất quán)
  const rt = vnpay.verifyReturn(qs)
  assert.equal(rt.ok, true, 'request URL roundtrip verify ok')

  // 2) return thật: VNPay thêm response fields + ký lại toàn bộ → verify phải ok
  const returnQuery = { ...qs, vnp_ResponseCode: '00', vnp_TransactionNo: '123' }
  const ok = vnpay.verifyReturn({ ...returnQuery, vnp_SecureHash: vnpay.sign(returnQuery) })
  assert.equal(ok.ok, true, 'return verify ok')
  assert.equal(ok.orderId, 42)
  assert.equal(ok.amountVnd, 500000, 'amount /100 về VND')
  assert.equal(ok.responseCode, '00')

  // 3a) tamper một field nhưng giữ hash cũ → reject
  const bad = vnpay.verifyReturn({ ...returnQuery, vnp_Amount: '99999900', vnp_SecureHash: returnQuery.vnp_SecureHash })
  assert.equal(bad.ok, false)
  assert.equal(bad.reason, 'BAD_HASH')
  // 3b) thiếu hash → reject
  const miss = vnpay.verifyReturn({ vnp_ResponseCode: '00' })
  assert.equal(miss.reason, 'MISSING_HASH')
})
