// Quy ước lớp phủ nổi (review end-user mục 4/8).
//
// Trước đây 5 thứ cùng tranh góc dưới màn hình, phần lớn ở cùng z-40, không thứ
// nào nhường thứ nào:
//   - CommunityFeed     fixed bottom-6 left-6  z-40
//   - LiveFeed          fixed bottom-4 left-4  z-30  (ẩn mobile — có comment
//     "Ẩn trên mobile để không đè sticky bar", tức là biết mà chỉ né một nửa)
//   - CompareDrawer pill fixed bottom-6 right-6 z-40
//   - ShoppingAssistant FAB fixed bottom-4 right-4 z-40
//   - PDP sticky bar    fixed inset-x-0 bottom-0 z-40 (mobile, cao ~66px)
//
// Hệ quả đo được: toast cộng đồng phủ lên tên + giá sản phẩm; và trên PDP mobile
// FAB trợ lý phủ lên chính nút "MUA SIZE" của sticky bar.
//
// Quy ước mới:
//   1. Trên mobile 80px dưới cùng thuộc về sticky bar của PDP → mọi widget nổi
//      phải nằm trên mức đó. Desktop không có sticky bar nên về bottom-4.
//   2. Một góc một chủ: dưới-trái = social proof, dưới-phải = trợ lý AI.
//      CTA so sánh cũng ở góc phải nhưng phải xếp TRÊN trợ lý (right-20).
//   3. z: widget thông tin < nút bấm < điều hướng/drawer.
export const BOTTOM_SAFE = 'bottom-20 md:bottom-4'
export const SLOT_BL = `fixed ${BOTTOM_SAFE} left-4 z-30` // social proof
export const SLOT_BR = `fixed ${BOTTOM_SAFE} right-4 z-40` // trợ lý AI
export const SLOT_BR_ABOVE = `fixed ${BOTTOM_SAFE} right-20 z-40` // CTA so sánh, né FAB
export const Z_NAV = 'z-50'
