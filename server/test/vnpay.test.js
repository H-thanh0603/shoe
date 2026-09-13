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

// ——— Refund API v2.1.1 (mục #1 business logic: refund provider thật) ———
// Mock global fetch — không gọi VNPay thật.
test('refund: sign đúng spec v2.1.1 + responseCode 00 → ok', async () => {
  process.env.VNPAY_TMN_CODE = 'TEST'
  process.env.VNPAY_HASH_SECRET = 'sec'
  let captured
  globalThis.fetch = async (url, opts) => {
    captured = { url, body: opts.body, headers: opts.headers }
    return { ok: true, status: 200, json: async () => ({ vnp_ResponseCode: '00', vnp_Message: 'Hoan tien thanh cong' }) }
  }
  try {
    const { requestRefund } = require('../services/vnpay.js')
    const r = await requestRefund({ orderId: 42, amountVnd: 1500000, transactionNo: '14001234', user: 'admin@test', ip: '10.0.0.1' })
    assert.ok(r.ok, 'responseCode 00 → ok')
    assert.equal(r.responseCode, '00')
    // form body đúng command + version + amount x100
    const params = new URLSearchParams(captured.body)
    assert.equal(params.get('vnp_Version'), '2.1.1')
    assert.equal(params.get('vnp_Command'), 'refund')
    assert.equal(params.get('vnp_Amount'), '150000000')
    assert.equal(params.get('vnp_TransactionNo'), '14001234')
    assert.ok(params.get('vnp_SecureHash'), 'có chữ ký')
    // chữ ký xác minh được bằng chính sign()
    const { sign } = require('../services/vnpay.js')
    const check = {}
    for (const [k, v] of params.entries()) if (k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') check[k] = v
    assert.equal(sign(check), params.get('vnp_SecureHash'), 'hash nội bộ khớp roundtrip')
  } finally {
    delete globalThis.fetch
  }
})

test('refund: provider trả lỗi (responseCode ≠ 00) → ok=false + message', async () => {
  process.env.VNPAY_TMN_CODE = 'TEST'
  process.env.VNPAY_HASH_SECRET = 'sec'
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ vnp_ResponseCode: '02', vnp_Message: 'Giao dich khong ton tai' }) })
  try {
    const { requestRefund } = require('../services/vnpay.js')
    const r = await requestRefund({ orderId: 99, amountVnd: 1, transactionNo: 'x' })
    assert.equal(r.ok, false)
    assert.equal(r.responseCode, '02')
    assert.ok(r.message.includes('khong ton tai'))
  } finally { delete globalThis.fetch }
})

test('refund: VNPay chết/timeout → ok=false, KHÔNG throw (route không 500)', async () => {
  process.env.VNPAY_TMN_CODE = 'TEST'
  process.env.VNPAY_HASH_SECRET = 'sec'
  globalThis.fetch = async () => { throw new Error('ECONNRESET') }
  try {
    const { requestRefund } = require('../services/vnpay.js')
    const r = await requestRefund({ orderId: 1, amountVnd: 1, transactionNo: 'x' })
    assert.equal(r.ok, false)
    assert.ok(r.message.includes('Không gọi được'))
  } finally { delete globalThis.fetch }
})

test('refund: thiếu transactionNo → từ chối trước khi gọi provider', async () => {
  process.env.VNPAY_TMN_CODE = 'TEST'
  process.env.VNPAY_HASH_SECRET = 'sec'
  let called = false
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) } }
  try {
    const { requestRefund } = require('../services/vnpay.js')
    const r = await requestRefund({ orderId: 1, amountVnd: 1 })
    assert.equal(r.ok, false)
    assert.ok(!called, 'không tốn 1 request provider')
    assert.ok(r.message.includes('TransactionNo'))
  } finally { delete globalThis.fetch }
})
