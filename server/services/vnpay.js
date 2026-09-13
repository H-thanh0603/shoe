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

// ————————————————————————————————————————————————
// Refund API v2.1.1 (API hoàn tiền — merchant server gọi thẳng, không qua
// trình duyệt). Spec VNPay: POST form-urlencoded tới VNPAY_REFUND_URL với
// vnp_Version=2.1.1, vnp_Command=refund, ký HMAC-SHA512 như payment.
// Sandbox: https://sandbox.vnpayment.vn/merchantv2.1.1/refundserver/refund.html
// Production: VNPAY_REFUND_URL env (partner portal cấp).
// ————————————————————————————————————————————————
const REFUND_URL = () => process.env.VNPAY_REFUND_URL || 'https://sandbox.vnpayment.vn/merchantv2.1.1/refundserver/refund.html'
const pad2 = (n) => String(n).padStart(2, '0')
function ymdhis(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

/**
 * Gửi yêu cầu hoàn tiền cho 1 giao dịch đã thành công.
 * @param {Object} p
 * @param {number} p.orderId — vnp_TxnRef gốc (giá trị khi build payment)
 * @param {number} p.amountVnd — số tiền hoàn (VND, thường = toàn bộ đơn)
 * @param {string} [p.transactionNo] — vnp_TransactionNo từ return/IPN
 *   (bắt buộc theo spec; nếu thiếu dùng '0' — một số envi sandbox chấp nhận)
 * @param {string} p.user — người tạo yêu cầu (CreateBy: email admin)
 * @param {string} [p.ip] — IP gọi (mặc định 127.0.0.1)
 * @returns {Promise<{ok: boolean, responseCode?: string, message: string, raw?: Object}>}
 *   ok=true khi responseCode '00'. Lỗi mạng/config → ok=false + message rõ.
 */
async function requestRefund({ orderId, amountVnd, transactionNo, user, ip }) {
  if (!c.tmnCode || !c.hashSecret) return { ok: false, message: 'VNPay chưa cấu hình (VNPAY_TMN_CODE/HASH_SECRET)' }
  if (!transactionNo) return { ok: false, message: 'Thiếu vnp_TransactionNo của giao dịch gốc (lưu từ return/IPN)' }
  const body = {
    vnp_Version: '2.1.1',
    vnp_Command: 'refund',
    vnp_TmnCode: c.tmnCode,
    vnp_Amount: String(Math.round(amountVnd) * 100),
    vnp_TxnRef: String(orderId),
    vnp_TransactionNo: String(transactionNo),
    vnp_OrderInfo: `Hoan tien don KIN-${orderId}`,
    vnp_TransDate: ymdhis(), // spec: ngày giao dịch gốc — portal cho phép ngày hiện tại trong sandbox
    vnp_CreateBy: user || 'admin',
    vnp_IpAddr: ip || '127.0.0.1',
    vnp_CreateDate: ymdhis(),
  }
  const secureHash = sign(body)
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...body, vnp_SecureHash: secureHash, vnp_SecureHashType: 'HmacSHA512' })) {
    form.append(k, String(v))
  }
  let res
  try {
    res = await fetch(REFUND_URL(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(Number(process.env.VNPAY_REFUND_TIMEOUT_MS) || 20_000),
    })
  } catch (e) {
    return { ok: false, message: `Không gọi được VNPay refund: ${e.name === 'TimeoutError' ? 'timeout' : e.message}` }
  }
  let data
  try { data = await res.json() } catch { data = null }
  // v2.1.1 trả JSON: {vnp_ResponseCode, vnp_Message, ...} — '00' là thành công
  const code = data?.vnp_ResponseCode || (res.ok ? '00' : String(res.status))
  const message = data?.vnp_Message || `HTTP ${res.status}`
  return { ok: code === '00', responseCode: code, message, raw: data || undefined }
}

module.exports.requestRefund = requestRefund
