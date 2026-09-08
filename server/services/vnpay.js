// VNPay integration — spec https://sandbox.vnpayment.vn/apis, no deps:
// sign = HMAC SHA512 over query sort key asc, excluding vnp_SecureHash.
// CRITICAL encoding: sign() AND buildPaymentUrl() MUST use the SAME value
// encoder (enc) so the roundtrip matches. Never build the URL with
// URLSearchParams: it form-encodes a literal '+' (our space marker) as %2B
// which breaks sign()/verify comparison.
//
// Sandbox test card: NCB 970419852619143388, name NGUYEN VAN A, 07/15, OTP 123456.
const crypto = require('node:crypto')

const c = {
  tmnCode: process.env.VNPAY_TMN_CODE || '',
  hashSecret: process.env.VNPAY_HASH_SECRET || '',
  url: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  // Return URL is the backend route (verify signature then redirect to SPA) — SPA never verifies itself
  returnUrl: process.env.VNPAY_RETURN_URL || '/api/v1/payments/vnpay/return',
}

// Value encoder matching VNPay/PHP urlencode: space -> '+'.
const enc = (v) => encodeURIComponent(v).replace(/%20/g, '+')

// VNPay needs an ABSOLUTE return URL. If env already set a full https:// URL -> keep it;
// otherwise build from the incoming request (behind nginx/LB set TRUST_PROXY=1).
function returnUrlFor(req) {
  const u = c.returnUrl
  if (/^https?:\/\//i.test(u)) return u
  const host = (req && typeof req.get === 'function' && req.get('host')) || process.env.HOST || 'localhost'
  const xfp = req?.headers?.['x-forwarded-proto']
  const proto = (xfp ? String(xfp).split(',')[0] : req?.protocol) || 'http'
  return `${proto}://${host}${u.startsWith('/') ? u : '/' + u}`
}

// Sign query per VNPay spec: sort key asc, drop vnp_SecureHash + empty values
function sign(query) {
  const sorted = Object.keys(query)
    .filter((k) => k.startsWith('vnp_') && query[k] !== '' && query[k] !== undefined && k !== 'vnp_SecureHash')
    .sort()
    .map((k) => `${k}=${enc(query[k])}`)
    .join('&')
  return crypto.createHmac('sha512', c.hashSecret).update(sorted).digest('hex')
}

// Build payment URL for an order. amountVnd * 100: VNPay expects amount in minor units.
function buildPaymentUrl({ orderId, amountVnd, ip, bankCode, returnUrl }) {
  if (!c.tmnCode || !c.hashSecret) return null // not configured -> caller stays COD-only
  const dt = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const now = {
    y: dt.getFullYear(), m: pad(dt.getMonth() + 1), d: pad(dt.getDate()),
    h: pad(dt.getHours()), i: pad(dt.getMinutes()), s: pad(dt.getSeconds()),
  }
  const query = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: c.tmnCode,
    vnp_Amount: String(amountVnd * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: String(orderId),
    vnp_OrderInfo: `Thanh toan don KIN-${orderId}`,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl || c.returnUrl,
    vnp_IpAddr: ip || '127.0.0.1',
    vnp_CreateDate: `${now.y}${now.m}${now.d}${now.h}${now.i}${now.s}`,
  }
  if (bankCode) query.vnp_BankCode = bankCode
  // vnp_SecureHashType phải NẰM TRONG dữ liệu ký (spec VNPay) — kể cả khi build lẫn khi verify.
  const full = { ...query, vnp_SecureHashType: 'HmacSHA512' }
  const secureHash = sign(full)
  // Manual query build with the SAME encoder as sign() — no URLSearchParams (see header comment).
  const qs = Object.entries({ ...full, vnp_SecureHash: secureHash })
    .map(([k, v]) => `${k}=${enc(v)}`)
    .join('&')
  return `${c.url}?${qs}`
}

// Verify VNPay return/redirect response — only trust responseCode when the hash matches.
function verifyReturn(query) {
  const received = query.vnp_SecureHash
  if (!received) return { ok: false, reason: 'MISSING_HASH' }
  if (sign(query) !== received.toLowerCase()) return { ok: false, reason: 'BAD_HASH' }
  return {
    ok: true,
    orderId: Number(query.vnp_TxnRef),
    responseCode: query.vnp_ResponseCode, // '00' = success
    transactionNo: query.vnp_TransactionNo || null,
    amountVnd: Number(query.vnp_Amount) / 100,
  }
}

module.exports = { buildPaymentUrl, verifyReturn, returnUrlFor, sign, configured: () => Boolean(c.tmnCode && c.hashSecret) }
