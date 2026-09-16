// Agent Tool Registry — lõi của "Agentic Web Interface" (AWI).
//
// Ý tưởng từ paper "Build the web for agents, not agents for the web" (Lù et al., 2025)
// và WebMCP (W3C WebML CG, đang incubation): website expose tool có schema rõ ràng
// thay vì bắt agent scrape UI, tìm nút, mô phỏng click.
//
// Thiết kế ràng buộc an toàn (human-in-the-loop cho consequential actions —
// đúng hướng W3C WebMCP "consequential actions" discussion):
// - Tool ĐỌC (search/detail/stock/reviews/track)  → agent tự gọi được.
// - Tool GHI nhẹ (add_to_cart)                    → agent gọi được; người dùng
//   xác nhận ở web app qua cart share/claim (luồng đã có sẵn).
// - Tool consequential (checkout/thanh toán 28.000.000đ) → KHÔNG expose.
//   Agent được trả handoff URL — người dùng bấm nút tự mình (giống checkpoint
//   của Gemini in Chrome / OpenAI Atlas).
//
// Mọi tool trả về JSON envelope { success, data } giống mọi API khác của shop.
// Giá luôn tính từ DB (server-side), không tin input giá từ agent.

const express = require('express')
const pool = require('../db.js')
const validate = require('../middleware/validate.js')
const { asyncHandler, httpError } = require('../middleware/errorHandler.js')
const { cacheGet } = require('../middleware/cache.js')
const { z } = require('zod')
const crypto = require('node:crypto')
const productsSvc = require('../services/products.js')
const { buildPrefs, matchScore, BUDGET, topWeakAxis, funnelLine } = require('../services/match.js')
const memorySvc = require('../services/agent/memory.js')

const router = express.Router()

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta && { meta }) })

// ————————————————————————————————————————————————
// TOOL REGISTRY — đơn nguồn sự thật, dùng cho cả
// GET /agent/tools (discovery), POST /agent/tools/call (invoke)
// và ai-plugin.json (manifest OpenAI-compatible).
//
// inputSchema: JSON Schema (chuẩn MCP "tools/list" trả về dạng này).
// rateLimit:    hits/phút cho 1 agent (chống tool spam).
// ————————————————————————————————————————————————
const TOOLS = [
  {
    name: 'search_products',
    description: 'Tìm giày theo từ khóa (tên/brand, có fuzzy). Trả về danh sách kèm giá VND, tồn kho tổng, tags.',
    readOnly: true,
    rateLimit: 30,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Từ khóa, ví dụ "nike chạy" hoặc "samba"' },
        limit: { type: 'integer', minimum: 1, maximum: 24, description: 'Số kết quả tối đa (default 8)' },
      },
      required: ['query'],
    },
    handler: async ({ query, limit = 8 }) => {
      const { items, meta } = await productsSvc.listProducts({ limit, page: 1, q: query.slice(0, 50) })
      return {
        total: meta.total,
        items: items.map((p) => ({
          slug: p.slug, name: p.name, brand: p.brand, tag: p.tag,
          priceVnd: p.price_vnd, stockTotal: p.stock_total,
          url: `/san-pham/${p.slug}`, image: p.images?.[0] || null,
        })),
      }
    },
  },
  {
    name: 'get_product',
    description: 'Chi tiết 1 sản phẩm theo slug: mô tả, giá, điểm mục đích sử dụng (perf/comfort/style/durability), tồn kho theo size, đánh giá trung bình.',
    readOnly: true,
    rateLimit: 60,
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Slug sản phẩm, ví dụ "air-vector-01"' } },
      required: ['slug'],
    },
    handler: async ({ slug }) => {
      const d = await productsSvc.getProductDetail(slug)
      const { items: reviews, avgRating } = await productsSvc.listReviews(slug)
      return {
        slug: d.slug, name: d.name, brand: d.brand, tag: d.tag,
        description: d.description, priceVnd: d.price_vnd, priceFormatted: d.price,
        purpose: d.purpose,
        scores: { perf: d.perf, comfort: d.comfort, style: d.style, durability: d.durability, daily: d.daily },
        sizes: d.variants.map((v) => ({ size: v.size, stock: v.stock })),
        collection: d.collection_slug ? { slug: d.collection_slug, name: d.collection_name } : null,
        soldCount: d.sold_count, wishlistCount: d.wishlist_count,
        avgRating, reviewCount: reviews.length,
        url: `/san-pham/${d.slug}`,
      }
    },
  },
  {
    name: 'check_stock',
    description: 'Kiểm tra tồn kho 1 sản phẩm theo size. Trả về số đôi còn của mỗi size và size bán chạy nhất (theo dữ liệu đơn thật).',
    readOnly: true,
    rateLimit: 60,
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
    handler: async ({ slug }) => {
      const d = await productsSvc.getProductDetail(slug)
      const { rows } = await pool.query(
        `SELECT oi.size_snapshot AS size, SUM(oi.qty) AS sold
         FROM order_items oi
         JOIN product_variants pv ON pv.id = oi.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE p.slug = $1 AND oi.size_snapshot IS NOT NULL GROUP BY oi.size_snapshot
         ORDER BY sold DESC LIMIT 3`,
        [slug],
      )
      return {
        slug,
        totalStock: d.variants.reduce((s, v) => s + v.stock, 0),
        sizes: d.variants.map((v) => ({ size: v.size, inStock: v.stock > 0, stock: v.stock })),
        bestSellingSizes: rows.map((r) => ({ size: r.size, sold: Number(r.sold) })),
      }
    },
  },
  {
    name: 'get_reviews',
    description: 'Đánh giá thật của khách (verified purchase) cho 1 sản phẩm — kèm rating, trích dẫn, số vote hữu ích.',
    readOnly: true,
    rateLimit: 30,
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Số review (default 5)' },
      },
      required: ['slug'],
    },
    handler: async ({ slug, limit = 5 }) => {
      const { items } = await productsSvc.listReviews(slug)
      return items.slice(0, limit).map((r) => ({
        rating: r.rating, content: r.content, verified: r.verified,
        helpfulCount: r.helpful_count, by: r.user_name, at: r.created_at,
      }))
    },
  },
  {
    name: 'compare_products',
    description: 'So sánh tối đa 4 sản phẩm theo giá, điểm perf/comfort/style/durability, tồn kho — trả bảng để agent tóm tắt cho người dùng. Truyền purpose để nhận verdict theo use-case ("đi bộ cả ngày" → đôi nào, "chạy nhẹ" → đôi nào) thay vì bảng số khô.',
    readOnly: true,
    rateLimit: 30,
    inputSchema: {
      type: 'object',
      properties: {
        slugs: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
        purpose: { type: 'string', description: 'Use-case cần verdict: running | street | court | daily | trail' },
      },
      required: ['slugs'],
    },
    handler: async ({ slugs, purpose }) => {
      const out = []
      for (const slug of [...new Set(slugs)].slice(0, 4)) {
        try {
          const d = await productsSvc.getProductDetail(slug)
          out.push({
            slug: d.slug, name: d.name, brand: d.brand, priceVnd: d.price_vnd,
            purpose: d.purpose,
            scores: { perf: d.perf, comfort: d.comfort, style: d.style, durability: d.durability },
            totalStock: d.variants.reduce((s, v) => s + v.stock, 0),
          })
        } catch { /* slug lạ — bỏ qua, trả phần còn lại */ }
      }
      if (!out.length) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm nào trong danh sách')
      if (!['running', 'street', 'court', 'daily', 'trail'].includes(purpose)) return out
      // verdict theo use-case: chấm mỗi đôi theo trục của purpose, xếp hạng +
      // nêu winner + khi nào chọn đôi còn lại (mapping nhu cầu, không đọc bảng).
      const AXIS = { running: 'perf', street: 'style', court: 'durability', daily: 'comfort', trail: 'durability' }
      const VN = { running: 'chạy bộ', street: 'đi chơi', court: 'bóng rổ', daily: 'đi bộ cả ngày', trail: 'đi địa hình' }
      const axis = AXIS[purpose]
      const ranked = [...out].sort((a, b) => (b.scores[axis] ?? 0) - (a.scores[axis] ?? 0))
      const cheapest = [...out].sort((a, b) => a.priceVnd - b.priceVnd)[0]
      return {
        items: out,
        verdict: {
          purpose, purposeVn: VN[purpose], axis,
          winner: ranked[0].slug,
          winnerWhy: `${ranked[0].name} — ${axis} cao nhất (${ranked[0].scores[axis]}) cho nhu cầu ${VN[purpose]}`,
          runnerUp: ranked[1] ? { slug: ranked[1].slug, when: `chọn ${ranked[1].name} nếu cần tiết kiệm hoặc thích brand ${ranked[1].brand}` } : null,
          cheapest: cheapest.slug !== ranked[0].slug ? { slug: cheapest.slug, saveVs: ranked[0].priceVnd - cheapest.priceVnd } : null,
        },
      }
    },
  },
  {
    name: 'track_order',
    description: 'Tra cứu đơn hàng theo mã ref (KIN-XXXXXX). Trả trạng thái, tổng tiền, danh sách món — không trả địa chỉ/email.',
    readOnly: true,
    rateLimit: 20,
    inputSchema: {
      type: 'object',
      properties: { refCode: { type: 'string', description: 'Mã đơn, ví dụ "KIN-ABC123"' } },
      required: ['refCode'],
    },
    handler: async ({ refCode }) => {
      const { rows: [o] } = await pool.query(
        'SELECT ref_code, status, total_vnd, payment_status, created_at FROM orders WHERE ref_code = $1',
        [refCode],
      )
      if (!o) throw httpError(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${refCode}`)
      const { rows: items } = await pool.query(
        'SELECT name_snapshot, size_snapshot, qty, unit_price_vnd FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id WHERE o2.ref_code = $1',
        [refCode],
      )
      return {
        refCode: o.ref_code, status: o.status, paymentStatus: o.payment_status,
        totalVnd: o.total_vnd, createdAt: o.created_at,
        items: items.map((i) => ({ name: i.name_snapshot, size: i.size_snapshot, qty: i.qty, unitPriceVnd: i.unit_price_vnd })),
        trackUrl: `/tra-don/${o.ref_code}`,
      }
    },
  },
  {
    name: 'recommend_products',
    description: 'Gợi ý giày theo nhu cầu khách (match engine của KINETIC). Agent mô tả: mục đích (running/street/court/daily/trail), ưu tiên (performance/comfort/style/durability/daily), ngân sách, brand/màu ưa thích → trả danh sách chấm điểm % match kèm lý do từng sản phẩm. Đây là cùng engine quiz "BẠN MUA GIÀY CHỦ YẾU ĐỂ?" trên web.',
    readOnly: true,
    rateLimit: 20,
    slow: true, // nhiều bước (load catalog + chấm điểm) → có progress khi stream
    inputSchema: {
      type: 'object',
      properties: {
        purpose: { type: 'string', description: 'Mục đích: running | street | court | daily | trail' },
        priorities: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'Ưu tiên: performance | comfort | style | durability | daily' },
        budget: { type: 'string', description: 'Ngân sách: under-2m (dưới 2 triệu) | 2-4m | 4m+' },
        brands: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Brand ưa thích (viết hoa), ví dụ ["NIKE","ASICS"]' },
        colors: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Màu hex ưa thích, ví dụ ["#e8e6e1"]' },
        limit: { type: 'integer', minimum: 1, maximum: 8, description: 'Số gợi ý (default 3)' },
      },
    },
    handler: async (args, ctx) => {
      const { purpose, priorities = [], budget, brands = [], colors = [], limit = 3 } = args
      const validPurpose = ['running', 'street', 'court', 'daily', 'trail'].includes(purpose) ? purpose : undefined
      const validBudget = ['under-2m', '2-4m', '4m+'].includes(budget) ? budget : undefined
      const validPriorities = priorities.filter((p) => ['performance', 'comfort', 'style', 'durability', 'daily'].includes(p))
      const profile = {
        purpose: validPurpose,
        budget: validBudget,
        brands: brands.map((b) => String(b).toUpperCase().slice(0, 20)),
        colors,
        prefs: buildPrefs({ purpose: validPurpose, priorities: validPriorities }),
      }

      const { items } = await productsSvc.listProducts({ limit: 100, page: 1 })
      ctx?.progress?.(`Đã tải ${items.length} sản phẩm — đang chấm điểm theo nhu cầu`)

      const cap = BUDGET[validBudget]
      const total = items.length
      const brandCut = profile.brands.length
        ? items.filter((p) => !profile.brands.includes(p.brand)).length : 0
      const afterBrand = items
        .filter((p) => !profile.brands.length || profile.brands.includes(p.brand)) // khách nêu brand → chỉ brand đó (eval 0.28→: brand +4đ không đủ loại Adidas khỏi query Nike)
      const budgetCut = cap == null
        ? 0 : afterBrand.filter((p) => p.price_vnd > cap).length
      const scored = afterBrand
        .map((p) => {
          const m = matchScore(profile, p)
          return m ? {
            slug: p.slug, name: p.name, brand: p.brand, priceVnd: p.price_vnd,
            purpose: p.purpose,
            match: m.pct, reasons: m.reasons,
            url: `/san-pham/${p.slug}`,
            inBudget: cap == null ? null : p.price_vnd <= cap,
            stockTotal: p.stock_total,
            // why-explain: điểm DNA thô để agent nói "vì sao đôi này" bằng số liệu;
            // tradeOff: trục khách cần nhưng đôi này yếu (<60) — agent cảnh báo thật.
            dna: { perf: p.perf, comfort: p.comfort, style: p.style, durability: p.durability, daily: p.daily },
            tradeOff: topWeakAxis(profile.prefs, p),
          } : null
        })
        .filter(Boolean)
        .filter((p) => cap == null || p.inBudget) // có ngân sách → chỉ trả sản phẩm trong tầm giá
        .sort((a, b) => b.match - a.match)

      ctx?.progress?.(`Chấm xong — top: ${scored.slice(0, 3).map((s) => `${s.name} ${s.match}%`).join(', ')}`)
      const funnel = { scanned: total, brandCut, budgetCut, kept: scored.length }
      return {
        interpreted: {
          purpose: validPurpose || 'không rõ',
          priorities: validPriorities,
          budget: validBudget || 'không giới hạn',
          brands: profile.brands,
        },
        // counts loại để agent nói được: "loại X vì vượt ngân sách, Y vì khác brand"
        funnel,
        funnelLine: funnelLine(funnel, validBudget, profile.brands),
        recommendations: scored.slice(0, limit),
      }
    },
  },
  {
    name: 'add_to_cart',
    description: 'Thêm 1 sản phẩm (slug + size) vào giỏ agent-side (server cart, không phải giỏ trình duyệt của người dùng). Sau khi gọi, trả shareToken để người dùng nhận giỏ qua link /gio-hang/:token và tự bấm thanh toán. KHÔNG thanh toán hộ được — checkout chỉ dành cho người dùng.',
    readOnly: false,
    rateLimit: 12,
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        size: { type: 'integer', description: 'Size EU (36–45)' },
        qty: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['slug', 'size'],
    },
    handler: async ({ slug, size, qty = 1 }, ctx) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: [v] } = await client.query(
          `SELECT pv.id, pv.stock, pv.size FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           WHERE p.slug = $1 AND pv.size = $2 AND p.is_active FOR UPDATE OF pv`,
          [slug, size],
        )
        if (!v) throw httpError(404, 'VARIANT_NOT_FOUND', `Không có ${slug} size ${size}`)
        if (v.stock < qty) throw httpError(409, 'OUT_OF_STOCK', `Chỉ còn ${v.stock} đôi size ${size}`)

        // giỏ agent: carts.session_token = "agent:" + ctx.agentId (1 agent 1 giỏ, TTL 30 ngày)
        const sessionToken = `agent:${ctx.agentId}`
        const { rows: [existing] } = await client.query('SELECT id FROM carts WHERE session_token = $1 FOR UPDATE', [sessionToken])
        let cartId = existing?.id
        if (!cartId) {
          const { rows: [created] } = await client.query(
            'INSERT INTO carts (session_token) VALUES ($1) RETURNING id', [sessionToken])
          cartId = created.id
        }
        const { rows: [line] } = await client.query(
          'SELECT id, qty FROM cart_items WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE', [cartId, v.id])
        const newQty = (line?.qty || 0) + qty
        if (newQty > v.stock) throw httpError(409, 'OUT_OF_STOCK', `Chỉ còn ${v.stock} đôi (giỏ đã có ${line?.qty || 0})`)
        if (line) await client.query('UPDATE cart_items SET qty = $1 WHERE id = $2', [newQty, line.id])
        else await client.query('INSERT INTO cart_items (cart_id, variant_id, qty) VALUES ($1,$2,$3)', [cartId, v.id, qty])

        // single-use share token — người dùng claim giỏ ở web rồi tự checkout.
        // source_session: nối funnel draft→claim→paid (§funnel).
        const shareToken = crypto.randomUUID()
        await client.query('INSERT INTO cart_share_tokens (token, cart_id, source_session) VALUES ($1,$2,$3)',
          [shareToken, cartId, String(ctx?.sessionId || '').slice(0, 100)])
        await client.query('COMMIT')
        return {
          slug, size, qty: newQty, stockLeft: v.stock - newQty,
          shareUrl: `/gio-hang/${shareToken}`,
          note: 'Người dùng mở shareUrl để nhận giỏ và tự thanh toán (human-in-the-loop).',
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
  },
  {
    // get_user_voucher — blueprint #2: agent đọc voucher hợp lệ (KHÔNG tự áp
    // — áp ở checkout bởi người dùng, tool validate dùng cùng pricing svc).
    name: 'get_user_voucher',
    description: 'Xem mã giảm giá công khai đang chạy (chỉ mã public, mỗi ngành hàng nếu có). Không trả voucher cá nhân. Người dùng tự nhập mã ở checkout — agent không áp mã hộ.',
    readOnly: true,
    requiresUser: false,
    rateLimit: 20,
    inputSchema: {
      type: 'object',
      properties: {
        subtotal: { type: 'integer', minimum: 0, description: 'Tổng tạm tính VND (để preview mức giảm, mặc định 0 = không preview)' },
      },
    },
    handler: async ({ subtotal = 0 }, ctx) => {
      const { rows } = await pool.query(
        `SELECT c.id, c.code, c.type, c.value, c.minimum_order_vnd, c.starts_at, c.expires_at, c.status, c.usage_limit, c.per_user_limit,
                COUNT(cu.order_id) AS used_count
         FROM coupons c
         LEFT JOIN coupon_usages cu ON cu.coupon_id = c.id
         WHERE c.status = 'active' AND now() >= c.starts_at AND (c.expires_at IS NULL OR now() <= c.expires_at)
         GROUP BY c.id
         ORDER BY c.created_at DESC LIMIT 10`,
      )
      const { couponDiscount } = require('../services/pricing.js')
      return {
        vouchers: rows.map((c) => {
          let preview = null
          if (subtotal > 0) {
            // couponDiscount cần user_used_count cho per_user_limit —
            // đếm theo user thật nếu đang login (req.user), guest chỉ preview
            const userCount = ctx?.req?.user?.id ? Number(c.used_count) : null
            try {
              const res = couponDiscount({ ...c, user_used_count: userCount }, subtotal, ctx?.req?.user?.id ?? null)
              preview = res.discount
            } catch { preview = null }
          }
          return {
            code: c.code, type: c.type, valueVnd: c.value,
            minSubtotalVnd: c.minimum_order_vnd,
            expiresAt: c.expires_at,
            previewDiscountVnd: preview,
          }
        }),
        note: 'Khách nhập mã ở bước thanh toán (sau khi nhận giỏ) — mức giảm thật hiển thị ở checkout.',
      }
    },
  },
  {
    // claim_and_attach_cart — blueprint #1 (step "checkout handoff"): agent
    // gọi 1 LẦN để đính link nhận giỏ vào đơn NHÁP (draft) cho người dùng
    // bấm nút tự thanh toán. Không tạo payment, không đổi trạng thái order.
    name: 'claim_and_attach_cart',
    description: 'Đính link nhận giỏ (shareUrl) đã tạo ở phiên này vào đúng một sản phẩm dòng chat để khách bấm ngay trong tin nhắn. KHÔNG tạo đơn/thanh toán — checkout vẫn do người dùng bấm nút. Chỉ gọi sau khi add_to_cart đã trả shareUrl.',
    readOnly: false,
    requiresUser: false,
    rateLimit: 12,
    inputSchema: {
      type: 'object',
      properties: {
        shareUrl: { type: 'string', description: 'shareUrl từ kết quả add_to_cart (vd "/gio-hang/<token>")' },
      },
      required: ['shareUrl'],
    },
    handler: async ({ shareUrl }, ctx) => {
      const token = /\/gio-hang\/([a-z0-9-]+)/i.exec(shareUrl || '')?.[1]
      if (!token) throw httpError(400, 'INVALID_SHARE_URL', 'shareUrl không đúng định dạng /gio-hang/<token>')
      // token phải thuộc giỏ agent này + chưa quá 24h (cart_share_tokens có TTL ở claim)
      const { rows: [t] } = await pool.query(
        `SELECT cst.token, cst.created_at FROM cart_share_tokens cst
         JOIN carts c ON c.id = cst.cart_id
         WHERE cst.token = $1 AND c.session_token = $2`,
        [token, `agent:${ctx.agentId}`],
      )
      if (!t) throw httpError(404, 'SHARE_TOKEN_NOT_FOUND', 'shareUrl không thuộc giỏ agent của phiên này — gọi add_to_cart trước')
      return {
        attached: true,
        shareUrl: `/gio-hang/${token}`,
        note: 'Hiển thị nút "NHẬN GIỎ & THANH TOÁN" — khách tự bấm (human-in-the-loop cho checkout).',
      }
    },
  },
  {
    // draft_bundle — "bundle một chạm": khách nêu nhu cầu → dựng sẵn combo
    // 2–3 món (chính + phụ bổ trợ) trong cùng 1 giỏ → 1 shareUrl.
    // Gọi workflows.draftBundle (qua executeTool từng bước nên mọi gate vẫn áp).
    // Human-in-the-loop như add_to_cart: chỉ chuẩn bị giỏ, checkout do khách bấm.
    name: 'draft_bundle',
    description: 'Dựng combo theo nhu cầu ("đi chạy mùa mưa", "đi học cả tuần"): giày chính + tối đa 2 món phụ bổ trợ cùng giỏ, trả 1 shareUrl nhận cả combo. Dùng khi khách muốn trọn bộ, không phải từng món lẻ.',
    readOnly: false,
    rateLimit: 6,
    inputSchema: {
      type: 'object',
      properties: {
        purpose: { type: 'string', description: 'running | street | court | daily | trail' },
        budget: { type: 'string', description: 'under-2m | 2-4m | 4m+' },
        brands: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        size: { type: 'integer', description: 'Size EU nếu khách đã cho' },
        qty: { type: 'integer', minimum: 1, maximum: 2 },
      },
    },
    handler: async (args, ctx) => {
      const { draftBundle } = require('../services/agent/workflows.js')
      // Dùng session của caller (nếu có) để provenance + seenShareUrls nối tiếp:
      // model gọi draft_bundle rồi claim_and_attach_cart sau vẫn qua gate.
      const shared = ctx?.session || { seenSlugs: new Set(), seenShareUrls: new Set() }
      const wfCtx = {
        role: 'assistant', agentId: ctx?.agentId || 'runtime', req: ctx?.req,
        sessionId: ctx?.sessionId || '', sessionTurn: 1, session: shared,
        progress: ctx?.progress || (() => {}),
      }
      const out = await draftBundle({ request: args, ctx: wfCtx })
      if (!out.ok) throw httpError(400, 'BUNDLE_FAILED', out.error || 'Không dựng được combo')
      return out
    },
  },
  {
    // get_memory — blueprint #10: agent đọc preference khách của phiên này.
    name: 'get_memory',
    description: 'Xem ghi nhớ về khách (brand ưa thích, size, ngân sách, mục đích) của phiên hiện tại. Dùng khi khách hỏi "giày cho tôi" để cá nhân hóa mà không hỏi lại.',
    readOnly: true,
    requiresUser: false,
    rateLimit: 30,
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { key } = memorySvc.resolveKey(ctx?.req)
      const prefs = await memorySvc.getPreferences(key)
      return {
        remembered: prefs,
        note: prefs.length ? 'Dùng để cá nhân hóa đề xuất. Khách nói mới nhất → theo khách, rồi save_memory.' : 'Chưa có ghi nhớ — hỏi khách + save_memory khi khách nói rõ preference.',
      }
    },
  },
  {
    // save_memory — blueprint #10: agent LƯU preference khách (chỉ whitelist).
    name: 'save_memory',
    description: 'Lưu ghi nhớ về khách (KHÔNG lưu thông tin nhạy cảm: thẻ, địa chỉ, mật khẩu). Chỉ nhận key: preferred_brand (vd "NIKE"), shoe_size (36-46), budget ("under-2m"|"2-4m"|"4m+"), preferred_purpose (running/street/court/daily/trail), preferred_style.',
    readOnly: false,
    requiresUser: false,
    rateLimit: 12,
    inputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array', minItems: 1, maxItems: 8,
          description: 'Danh sách {key, value} — vd [{key:"preferred_brand", value:"NIKE"}, {key:"shoe_size", value:"42"}]',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'preferred_brand | shoe_size | budget | preferred_purpose | preferred_style' },
              value: { type: 'string', description: 'Giá trị (string; size vd "42")' },
            },
            required: ['key', 'value'],
          },
        },
      },
      required: ['entries'],
    },
    handler: async ({ entries }, ctx) => {
      const { key } = memorySvc.resolveKey(ctx?.req)
      const results = await memorySvc.savePreferences(key, entries)
      const saved = results.filter((r) => r.saved)
      return {
        savedCount: saved.length,
        results: results.map((r) => r.saved
          ? { key: r.key, value: r.value, ok: true }
          : { key: r.key, error: r.reason || 'không lưu được', ok: false }),
      }
    },
  },
  {
    // forget_memory — quyền quên: khách nói "quên tôi đi" → agent gọi tool này,
    // không cần hỏi lại. Xoá preference phân vùng hiện tại (user hoặc anon-hash).
    name: 'forget_memory',
    description: 'Xoá TẤT CẢ ghi nhớ về khách của phiên hiện tại. Gọi ngay khi khách yêu cầu quên/xoá dữ liệu ("quên tôi đi", "xoá ghi nhớ").',
    readOnly: false,
    requiresUser: false,
    rateLimit: 6,
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { key } = memorySvc.resolveKey(ctx?.req)
      const deleted = await memorySvc.clearPreferences(key)
      return { forgotten: true, deleted, note: 'Đã xoá mọi ghi nhớ phiên này.' }
    },
  },
]

const toolByName = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

// ————————————————————————————————————————————————
// GET /api/v1/agent/tools — discovery (MCP tools/list shape)
// Public: agent cần list tools trước khi quyết định gọi gì.
// ————————————————————————————————————————————————
router.get('/tools',
  cacheGet('agent:tools', 300, () => 'registry'),
  asyncHandler(async (_req, res) => {
    ok(res, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        readOnly: t.readOnly,
        rateLimitPerMinute: t.rateLimit,
        inputSchema: t.inputSchema,
      })),
      callEndpoint: '/api/v1/agent/tools/call',
      callStreamEndpoint: '/api/v1/agent/tools/call/stream',
      documentation: '/docs/API.md',
      // checkout/thanh toán cố tình KHÔNG có tool — dùng add_to_cart + shareUrl
      consequentialPolicy: 'Không expose tool thanh toán. Hành vi consequential (checkout) phải do người dùng thực hiện qua shareUrl.',
    })
  }))

// ————————————————————————————————————————————————
// POST /api/v1/agent/tools/call — invoke 1 tool
// Body: { name, arguments } — đúng shape MCP tools/call.
// Header X-Agent (khuyến nghị): định danh agent, ví dụ "shopping-assistant/1.0 (vendor:x)"
// — kiểu "agent identification" mà "Towards an Agent-First Web" đề xuất.
// ————————————————————————————————————————————————
const callSchema = z.object({
  name: z.string().trim().min(1).max(60),
  arguments: z.record(z.string(), z.unknown()).default({}),
  sessionId: z.string().trim().max(100).optional(),
})

// Invoke chung cho /call (JSON) và /call/stream (SSE):
// resolve tool → agent identity → rate-limit (tool,agentId) → validate args → handler.
// Trả { tool, agentId, result } hoặc throw httpError (stream sẽ bắt và emit event error).
async function invokeTool(req) {
  const tool = toolByName[req.body.name]
  if (!tool) throw httpError(404, 'TOOL_NOT_FOUND', `Không có tool "${req.body.name}" — xem GET /api/v1/agent/tools`)

  // Agent identity: header X-Agent, fallback user đã login, fallback "anonymous"
  const agentId = (req.get('X-Agent') || '').slice(0, 120) || `user:${req.user?.id ?? 'anonymous'}`

  // rate-limit theo (tool, agent) qua cache incr — fail-open (Redis chết → vẫn cho gọi,
  // có rateLimit express ở router ngoài cùng chặn tổng).
  // Write tools (readOnly=false): key thêm IP để xoay X-Agent không né được limit.
  try {
    const cache = require('../services/cache.js')
    const rlId = tool.readOnly === false ? `${agentId}|${req.ip}` : agentId
    const key = `rl:agenttool:${tool.name}:${rlId}`
    const hits = await cache.incrWithTtl(key, 60)
    if (hits > tool.rateLimit) throw httpError(429, 'TOOL_RATE_LIMITED', `Tool "${tool.name}" giới hạn ${tool.rateLimit} lần/phút`)
  } catch (e) {
    if (e?.code === 'TOOL_RATE_LIMITED') throw e
    /* cache lỗi — bỏ qua limit, request vẫn chạy */
  }

  // Validate arguments theo JSON Schema của tool (zod mirror)
  const zodMirror = buildZod(tool.inputSchema)
  const parsed = zodMirror.safeParse(req.body.arguments)
  if (!parsed.success) {
    throw Object.assign(
      httpError(400, 'INVALID_TOOL_ARGS', 'arguments không khớp inputSchema của tool'),
      { fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    )
  }

  const result = await tool.handler(parsed.data, {
    agentId, req,
    sessionId: String(req.body.sessionId || '').slice(0, 100),
    // /call (JSON) không stream được → progress no-op; /call/stream truyền hàm emit SSE
    progress: req._toolProgress || (() => {}),
  })
  return { tool, agentId, result }
}

router.post('/tools/call',
  validate(callSchema),
  asyncHandler(async (req, res) => {
    const { tool, agentId, result } = await invokeTool(req)
    ok(res, { tool: tool.name, agent: agentId, result })
  }))

// POST /api/v1/agent/tools/call/stream — SSE variant của /call cho tool chạy nhiều bước:
// event `progress` (tool tự báo từng bước qua ctx.progress), event `result` cuối cùng.
// Cùng rate-limit + validation + envelope lỗi — client không stream được thì dùng /call.
// (Pattern giống /agent/chat/stream đã có — fetch + ReadableStream đọc, EventSource không POST được.)
router.post('/tools/call/stream',
  validate(callSchema),
  async (req, res) => {
    const sse = (event, obj) => res.write(`event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: không buffer SSE — flush từng event
    })
    // progress events cho tool nhiều bước (recommend, compare...) — tool gọi ctx.progress(msg)
    req._toolProgress = (msg) => sse('progress', { message: String(msg).slice(0, 200) })
    try {
      const { tool, agentId, result } = await invokeTool(req)
      sse('result', { success: true, data: { tool: tool.name, agent: agentId, result } })
    } catch (e) {
      sse('error', {
        success: false,
        error: { code: e?.code || 'INTERNAL', message: e?.status && e.status < 500 ? e.message : 'Lỗi server' },
      })
    }
    res.end()
  })

// JSON Schema (subset mình dùng trong TOOLS) → zod schema.
// Không cần validator tổng quát — registry là nguồn đóng, không nhận schema từ ngoài.
function buildZod(schema) {
  const props = schema?.properties || {}
  const shape = {}
  for (const [k, v] of Object.entries(props)) {
    let s
    if (v.type === 'string') s = z.string().min(1)
    else if (v.type === 'integer') {
      s = z.number().int()
      if (v.minimum !== undefined) s = s.min(v.minimum)
      if (v.maximum !== undefined) s = s.max(v.maximum)
    }
    else if (v.type === 'number') s = z.number()
    else if (v.type === 'array') {
      const itemType = v.items || {}
      const item = itemType.type === 'object'
        ? buildZod(itemType) // array of objects (vd save_memory entries)
        : z.string().min(1)
      s = z.array(item)
      if (v.minItems) s = s.min(v.minItems)
      if (v.maxItems) s = s.max(v.maxItems)
    } else s = z.unknown()
    if (!schema.required?.includes(k)) s = s.optional()
    shape[k] = s
  }
  return z.object(shape).strict()
}

// ————————————————————————————————————————————————
// GET /api/v1/agent/page/:slug — trang sản phẩm machine-readable.
// Agent đọc 1 request này thay vì: load HTML → chờ JS → screenshot → vision OCR.
// Đây là "Agentic Web Interface" theo nghĩa đen của paper Lù et al.
// ————————————————————————————————————————————————
router.get('/page/:slug',
  cacheGet('agent:page', 60, (req) => req.params.slug.slice(0, 120)),
  asyncHandler(async (req, res) => {
    const slug = req.params.slug
    const d = await productsSvc.getProductDetail(slug)
    const { items: reviews, avgRating } = await productsSvc.listReviews(slug)
    const base = `${req.protocol}://${req.get('host')}`
    res.set('Content-Type', 'application/json') // ghi đè cache middleware mặc định
    res.json({
      success: true,
      data: {
        // ngữ cảnh cho agent: đây là JSON cho agent, không phải HTML cho human
        format: 'agent-page-v1',
        url: `${base}/san-pham/${slug}`,
        humanUrl: `${base}/san-pham/${slug}`,
        product: {
          slug: d.slug, name: d.name, brand: d.brand, tag: d.tag,
          description: d.description,
          priceVnd: d.price_vnd, priceFormatted: d.price,
          currency: 'VND',
          purpose: d.purpose,
          scores: { perf: d.perf, comfort: d.comfort, style: d.style, durability: d.durability, daily: d.daily },
          sizes: d.variants.map((v) => ({ size: v.size, inStock: v.stock > 0, stock: v.stock })),
          colors: d.colors,
          images: d.images || [],
          collection: d.collection_slug ? { slug: d.collection_slug, name: d.collection_name } : null,
          soldCount: d.sold_count, wishlistCount: d.wishlist_count,
          avgRating, reviewCount: reviews.length,
        },
        reviews: reviews.slice(0, 10).map((r) => ({
          rating: r.rating, content: r.content, verified: r.verified, by: r.user_name,
        })),
        // agent có thể hành động tiếp ngay từ đây:
        actions: [
          { tool: 'add_to_cart', endpoint: '/api/v1/agent/tools/call', args: { slug: d.slug, size: '<size EU 36-45>', qty: 1 } },
        ],
        tools: '/api/v1/agent/tools',
      },
    })
  }))

module.exports = router
module.exports.TOOLS = TOOLS
// agent runtime (services/agent/tools.js) validate args model gọi tool bằng
// cùng zod mirror này — 1 nguồn validation cho cả HTTP invoke và agent loop.
module.exports.buildZod = buildZod
