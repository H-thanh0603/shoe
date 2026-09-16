// Trang chính sách tĩnh: vận chuyển / đổi trả / điều khoản / bảo mật.
// Nội dung khớp hành vi shop thật (COD+VNPay, đổi size 30 ngày, PII mã hoá).
// Footer link tới từng mục qua /chinh-sach/<slug>.
const SECTIONS = {
  'van-chuyen': {
    title: 'CHÍNH SÁCH VẬN CHUYỂN',
    body: [
      'Giao hàng toàn quốc, phí ship tính lúc checkout (miễn phí theo ngưỡng hiển thị trong giỏ).',
      'Nội thành Hà Nội: giao hỏa tốc trong 2 giờ (giờ hành chính). Tỉnh khác: 2–4 ngày làm việc.',
      'Đơn COD: thanh toán tiền mặt khi nhận hàng. Đơn VNPay: thanh toán online trước khi giao.',
      'Kiểm tra hành trình đơn bất cứ lúc nào tại trang Tra cứu đơn bằng mã KIN-XXXXXX.',
    ],
  },
  'doi-tra': {
    title: 'ĐỔI TRẢ & HOÀN TIỀN',
    body: [
      'Đổi size miễn phí trong 30 ngày kể từ khi nhận hàng (giày chưa mang ra ngoài, còn nguyên hộp/tag).',
      'Trả hàng hoàn tiền trong 7 ngày nếu lỗi từ nhà sản xuất (keo, đế, đường may). Shop chịu phí ship 2 chiều cho lỗi.',
      'Đơn COD đã giao: hoàn tiền chuyển khoản trong 3–5 ngày làm việc sau khi shop nhận lại hàng.',
      'Đơn VNPay bị hủy sau khi đã thanh toán: hoàn tự động về tài khoản qua VNPay (theo dõi trạng thái ở Tra cứu đơn).',
      'Không áp dụng đổi trả cho sản phẩm đã mang trầy đế hoặc mất tag.',
    ],
  },
  'dieu-khoan': {
    title: 'ĐIỀU KHOẢN MUA HÀNG',
    body: [
      'Giá hiển thị đã gồm VAT, tính bằng VND. Giá chốt tại thời điểm đặt đơn thành công.',
      'Shop có quyền hủy đơn khi hết hàng đột xuất hoặc thông tin nhận hàng không liên lạc được sau 3 lần gọi.',
      'Mã giảm giá: mỗi đơn 1 mã, không cộng dồn, không quy đổi thành tiền mặt.',
      'Hình ảnh mang tính minh họa màu sắc thực tế có thể lệch nhẹ do màn hình.',
    ],
  },
  'bao-mat': {
    title: 'CHÍNH SÁCH BẢO MẬT',
    body: [
      'Thông tin đặt hàng (tên, SĐT, email, địa chỉ) được mã hoá khi lưu trữ, chỉ dùng để giao hàng và chăm sóc đơn.',
      'Shop không bán, không chia sẻ dữ liệu khách cho bên thứ ba vì mục đích quảng cáo.',
      'Khách có thể yêu cầu xoá dữ liệu: nhắn trợ lý mua giày "quên tôi đi" (xoá ghi nhớ AI) hoặc liên hệ shop để xoá tài khoản.',
      'Email newsletter: chỉ gửi khi khách tự đăng ký, huỷ đăng ký 1 chạm trong mỗi mail.',
    ],
  },
}

export const POLICY_LINKS = [
  ['VẬN CHUYỂN', '/chinh-sach/van-chuyen'],
  ['ĐỔI TRẢ', '/chinh-sach/doi-tra'],
  ['ĐIỀU KHOẢN', '/chinh-sach/dieu-khoan'],
  ['BẢO MẬT', '/chinh-sach/bao-mat'],
]

export default function Policy({ slug }) {
  const s = SECTIONS[slug]
  if (!s) {
    return (
      <main id="main-content" className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:pt-32">
        <p className="font-mono text-xs tracking-widest text-accent">404 //</p>
        <h1 className="display-l mt-1 text-paper">KHÔNG CÓ CHÍNH SÁCH NÀY<span className="text-accent">.</span></h1>
        <a href="/shop" className="mt-6 inline-block border border-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-accent hover:bg-accent hover:text-ink">MUA SẮM NGAY</a>
      </main>
    )
  }
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 pt-24 pb-28 md:pt-32">
      <p className="font-mono text-xs tracking-widest text-accent">CHÍNH SÁCH //</p>
      <h1 className="display-l mt-1 text-paper">{s.title}<span className="text-accent">.</span></h1>
      <ul className="mt-6 flex flex-col gap-3">
        {s.body.map((p) => (
          <li key={p} className="border-l-2 border-accent/60 pl-4 text-sm leading-relaxed text-paper/75">{p}</li>
        ))}
      </ul>
      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Chính sách khác">
        {POLICY_LINKS.filter(([, href]) => href !== `/chinh-sach/${slug}`).map(([l, href]) => (
          <a key={href} href={href} className="border border-white/15 px-3 py-1.5 font-mono text-[11px] text-paper/60 hover:border-accent hover:text-accent">{l}</a>
        ))}
      </nav>
    </main>
  )
}
