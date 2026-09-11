// AWI (Agentic Web Interface) manifests + llms.txt — lớp giao tiếp "cho agent đọc"
// của website KINETIC, theo hướng của:
//  - "Build the web for agents, not agents for the web" (Lù et al., 2025): website
//    expose giao diện riêng cho agent thay vì bắt agent scrape UI.
//  - "Towards an Agent-First Web" (2026): agent identification, agent-friendly
//    content, machine-readable layer song song human layer.
//  - llms.txt (llmstxt.org): chuẩn de-facto để LLM crawler đọc hiểu site.
//
// Manifest là JSON tĩnh (chỉ vài chỗ interpolate) — render khi request, cache HTTP
// header là đủ, không cần cache app.
const pool = require('./db.js')
const productsSvc = require('./services/products.js')

const BASE_ENV = process.env.PUBLIC_BASE_URL || ''

// ——— /.well-known/agent.json — AWI discovery ———
// Agent mới đến site: GET /.well-known/agent.json đầu tiên để biết site này
// "nói chuyện được" và nói bằng gì. Tương tự ý tưởng WebMCP discovery
// đang bàn trong W3C WebML CG (chưa chuẩn hóa — đây là best-effort shape
// theo phiên bản thảo luận, không cam kết ổn định).
function renderAgentJson(base) {
  return {
    protocol: 'awi/0.1',
    name: 'KINETIC Storefront',
    description: 'Cửa hàng giày thể thao KINETIC — catalog, tồn kho, giỏ hàng, tra cứu đơn. Expose tool cho AI agent với checkout luôn do người dùng xác nhận (human-in-the-loop).',
    url: base,
    // điểm vào cho agent:
    discovery: {
      toolsList: '/api/v1/agent/tools',
      toolsCall: '/api/v1/agent/tools/call',
      agentPages: '/api/v1/agent/page/:slug',
      llmsTxt: '/llms.txt',
      llmsFullTxt: '/llms-full.txt',
      manifest: '/.well-known/ai-plugin.json',
    },
    // quy ước gọi tool: header định danh agent (agent identification)
    conventions: {
      agentIdentityHeader: 'X-Agent',
      agentIdentityFormat: '<name>/<version> (by:<operator>)',
      envelope: '{ success: boolean, data|error }',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      language: 'vi',
    },
    // policy an toàn — đúng tinh thần W3C WebMCP "consequential actions":
    policies: {
      readOnlyTools: 'Tự do gọi trong rate limit.',
      cartTools: 'Tạo giỏ server-side, trả shareUrl cho người dùng nhận — không đặt hộ.',
      consequentialActions: ['checkout', 'payment'],
      consequentialPolicy: 'Website KHÔNG expose tool thanh toán/đặt hàng. Agent dừng ở add_to_cart; người dùng tự checkout qua shareUrl (giống checkpoint của browser agents 2025-2026).',
    },
    rateLimits: { perTool: 'xem rateLimitPerMinute từng tool tại toolsList', general: '50 req/s/IP tại edge' },
  }
}

// ——— /.well-known/ai-plugin.json — tương thích manifest kiểu OpenAI plugin ———
// OpenAI đã deprecated plugin nền tảng, nhưng shape này quen thuộc với phần lớn
// agent framework và được nhiều client MCP hiểu ngầm — giữ như bản dịch của
// agent.json sang manifest "ai-plugin" truyền thống.
function renderAiPluginJson(base, tools) {
  return {
    schema_version: 'v1',
    name_for_human: 'KINETIC Shoe Store',
    name_for_model: 'kinetic_shoe_store',
    description_for_human: 'Tìm giày, xem tồn kho, đọc review thật, so sánh sản phẩm và tạo giỏ hàng shareable tại KINETIC.',
    description_for_model: 'Tools for KINETIC shoe store: search_products, get_product, check_stock, get_reviews, compare_products, track_order, add_to_cart. Prices in VND. Checkout is NOT available to agents — add_to_cart returns a shareUrl for the human user to complete checkout.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      // OpenAPI quy ước: trong ai-plugin manifest cổ điển đây là URL file spec.
      // Viết inline spec tối giản (chỉ đường dẫn tool) để tự chứa — client
      // framework hiện đại đọc toolsList của chúng tôi là chính.
      has_user_authentication: false,
      toolsList: `${base}/api/v1/agent/tools`,
      toolsCall: `${base}/api/v1/agent/tools/call`,
    },
    // bản tóm tắt tools để client không phải request thêm nếu chỉ cần cái nhìn nhanh
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      readOnly: t.readOnly,
    })),
    logo_url: `${base}/favicon.svg`,
    contact_email: 'hello@kinetic.vn',
    legal_info_url: `${base}/`,
  }
}

// ——— /llms.txt — "README cho LLM" (llmstxt.org) ———
// Hệ quả của epistemic recursion paper: LLM cần nguồn có cấu trúc + provenance
// thay vì chỉ HTML. llms.txt = mục lục ngắn; llms-full.txt = catalog đầy đủ.
async function renderLlmsTxt(req) {
  const base = BASE_ENV || `${req.protocol}://${req.get('host')}`
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM products WHERE is_active')
  const { rows: collections } = await pool.query('SELECT slug, name FROM collections ORDER BY id')
  const lines = [
    '# KINETIC',
    '',
    '> Cửa hàng giày thể thao KINETIC (Việt Nam). Giá VND. Agent có thể dùng tools thay vì scrape UI.',
    '',
    'KINETIC bán giày running/street/trail/court/daily của các brand KINETIC, Nike, Adidas, New Balance, Asics, Puma.',
    `Hiện có ${Number(count)} sản phẩm đang bán.`,
    '',
    '## Tools cho AI agent',
    '',
    '- [Agent manifest](/.well-known/agent.json): discovery endpoint, quy ước gọi tool, chính sách an toàn.',
    '- [Danh sách tools](/api/v1/agent/tools): search_products, get_product, check_stock, get_reviews, compare_products, track_order, add_to_cart (JSON schema kèm theo).',
    '- [Trang agent](/api/v1/agent/page/:slug): sản phẩm dạng machine-readable (1 request thay cho screenshot+vision).',
    '- [Catalog đầy đủ cho LLM](/llms-full.txt): toàn bộ sản phẩm + giá + size, định dạng text nén.',
    '',
    '## Con trỏ quan trọng',
    '',
    '- [API docs](https://github.com/H-Thanh0603/shoe — docs/API.md): REST API đầy đủ của storefront.',
    ...collections.map((c) => `- Bộ sưu tập ${c.name}: /bo-suu-tap/${c.slug}`),
    '- Tra đơn hàng: /tra-don/:refCode',
    '',
    '## Chính sách',
    '',
    '- Agent KHÔNG thể thanh toán/đặt hàng. Hành vi consequential (checkout) do người dùng thực hiện.',
    '- Giá và tồn kho luôn lấy từ DB tại thời điểm gọi — không tin số liệu cũ.',
    '- Định danh agent qua header `X-Agent: <name>/<version> (by:<operator>)`.',
    '',
  ]
  return { body: lines.join('\n'), base }
}

// ——— /llms-full.txt — catalog nén để LLM đọc 1 lần ———
async function renderLlmsFullTxt(req) {
  const base = BASE_ENV || `${req.protocol}://${req.get('host')}`
  const { items } = await productsSvc.listProducts({ limit: 100, page: 1 })
  const chunks = [
    '# KINETIC — Catalog đầy đủ (tự sinh từ DB, cập nhật theo request)',
    '',
    `Base URL: ${base} · Giá VND · Size EU 36-45 · Nguồn: ${base}/llms.txt`,
    '',
  ]
  for (const p of items) {
    chunks.push(`## ${p.name} (${p.brand})`)
    chunks.push(`- URL: ${base}/san-pham/${p.slug}`)
    chunks.push(`- Giá: ${p.price_vnd.toLocaleString('vi-VN')}₫${p.tag ? ` [${p.tag}]` : ''}`)
    chunks.push(`- Tồn kho: ${p.stock_total} đôi`)
    chunks.push(`- Mục đích: ${p.purpose} · Điểm: perf ${p.perf}, êm ${p.comfort}, style ${p.style}, bền ${p.durability}`)
    chunks.push(`- Mô tả: ${p.description}`)
    chunks.push(`- Agent page: ${base}/api/v1/agent/page/${p.slug}`)
    chunks.push('')
  }
  chunks.push('---')
  chunks.push('Số liệu trên lấy trực tiếp từ database tại thời điểm render. Dùng tool check_stock / get_product để có số liệu mới nhất.')
  return chunks.join('\n')
}

module.exports = { renderAgentJson, renderAiPluginJson, renderLlmsTxt, renderLlmsFullTxt }
