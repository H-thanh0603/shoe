// Golden set ranking: query → slug kỳ vọng top-3.
// Chạy: npm run eval:ranking (cần DB + server logic, không cần HTTP).
// Thêm case mới khi khách phàn nàn gợi ý dở — kỳ vọng = slug đúng ý khách lúc đó.
module.exports = [
  { q: 'giày chạy bộ', args: { purpose: 'running', limit: 3 }, expectTop3: ['pegasus-41', 'air-vector-01', 'hyper-drive-x'] },
  { q: 'giày chạy dưới 4tr', args: { purpose: 'running', budget: '2-4m', limit: 3 }, expectTop3: ['pegasus-41', 'infinity-rn-4', 'run-wild-pro'] },
  { q: 'giày bóng rổ Nike', args: { purpose: 'court', brands: ['NIKE'], limit: 3 }, expectTop3: ['pegasus-41', 'vomero-18', 'infinity-rn-4'] },
  { q: 'giày đi phố', args: { purpose: 'street', limit: 3 }, expectTop3: ['night-pulse', 'samba-og', '550-white'] },
  { q: 'giày trail', args: { purpose: 'trail', limit: 3 }, expectTop3: ['gel-fuji-trabuco', 'terrex-free-hiker', 'hiero-v1'] },
  { q: 'giày rẻ dưới 2tr', args: { budget: 'under-2m', limit: 3 }, expectTop3: ['suede-classic'] },
  { q: 'Adidas đi hàng ngày', args: { purpose: 'daily', brands: ['ADIDAS'], limit: 3 }, expectTop3: ['samba-og', 'gazelle-indoor', 'dame-9'] },
  { q: 'Asics chạy marathon', args: { purpose: 'running', brands: ['ASICS'], limit: 3 }, expectTop3: ['gel-nimbus-26', 'gel-kayano-31', 'gt-2160'] },
  { q: 'Puma phong cách', args: { purpose: 'street', brands: ['PUMA'], priorities: ['style'], limit: 3 }, expectTop3: ['suede-classic', 'mb-lo', 'deviate-nitro-3'] },
  { q: 'New Balance chạy', args: { purpose: 'running', brands: ['NEW BALANCE'], limit: 3 }, expectTop3: ['fresh-foam-more-v5', 'hiero-v1', '990v6'] },
  { q: 'giày đắt tiền', args: { budget: '4m+', limit: 3 }, expectTop3: ['air-vector-01', 'run-wild-pro', 'street-flow'] },
  { q: 'Nike dưới 3tr', args: { budget: '2-4m', brands: ['NIKE'], limit: 3 }, expectTop3: ['court-vision', 'blazer-mid', 'infinity-rn-4'] },
]
