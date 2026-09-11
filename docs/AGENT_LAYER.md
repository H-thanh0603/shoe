# KINETIC — Agentic Web Interface (Agent Layer)

KINETIC có **2 lớp giao tiếp** — mô hình "Human layer + Agent layer" mà các paper
Agentic Web 2025-2026 (AWI — Lù et al., Agent-First Web, WebMCP/W3C WebML CG) đề xuất:

```
                    KINETIC STORE
                         │
              ┌──────────┴──────────┐
              │                     │
          HUMAN UI              AGENT UI
       (React SPA, 3D,      (tools + JSON
        animation, đẹ)       machine-readable)
              │                     │
     UI/UX/Emotion         search_products()
     Storytelling          get_product()
     Brand/Trust           check_stock()
                           get_reviews()
                           compare_products()
                           track_order()
                           add_to_cart() → shareUrl
              │                     │
              └──────────┬──────────┘
                         ▼
                    Checkout — CHỈ người dùng
                  (human-in-the-loop)
```

## Endpoint

| Method | Path | Mô tả |
|---|---|---|
| GET | `/.well-known/agent.json` | AWI manifest — discovery + quy ước + policy. Agent mới vào site đọc file này đầu tiên. |
| GET | `/.well-known/ai-plugin.json` | Manifest tương thích shape OpenAI plugin (deprecated nhưng nhiều framework hiểu). |
| GET | `/llms.txt` | Mục lục cho LLM (chuẩn llmstxt.org) — con trỏ tới tools + catalog. |
| GET | `/llms-full.txt` | Toàn bộ catalog (27 sản phẩm) dạng text nén, tự sinh từ DB. |
| GET | `/api/v1/agent/tools` | **Tool discovery** — JSON Schema từng tool, đúng shape MCP `tools/list`. Cache 5 phút. |
| POST | `/api/v1/agent/tools/call` | **Tool invocation** — body `{name, arguments}` như MCP `tools/call`. |
| GET | `/api/v1/agent/page/:slug` | Trang sản phẩm machine-readable — 1 request thay cho load HTML + screenshot + vision. |

POST `/agent/tools/call` cần header định danh agent (agent identification —
"Towards an Agent-First Web"):

```
X-Agent: shopping-assistant/1.0 (by:acme)
```

## Tools

| Tool | Đọc/Ghi | Rate limit | Ghi chú |
|---|---|---|---|
| `search_products` | Đọc | 30/phút | Fuzzy search tên/brand, trả giá VND từ DB. |
| `get_product` | Đọc | 60/phút | Đầy đủ: scores perf/comfort/style/durability, sizes, reviews avg. |
| `check_stock` | Đọc | 60/phút | Tồn kho theo size + size bán chạy nhất (từ đơn thật). |
| `get_reviews` | Đọc | 30/phút | Review verified-purchase thật. |
| `compare_products` | Đọc | 30/phút | Tối đa 4 slug, bảng so sánh. |
| `track_order` | Đọc | 20/phút | Theo refCode `KIN-XXXXXX`. Không trả địa chỉ/email. |
| `add_to_cart` | Ghi | 12/phút | Giỏ server-side của agent → trả **shareUrl** `/gio-hang/:token`. |

**Không có tool checkout/payment** — cố tình. Xem chính sách dưới.

## Human-in-the-loop cho consequential actions

Theo hướng WebMCP "consequential actions" (W3C 2026 discussion) và thực tế
browser agents (Gemini in Chrome, OpenAI Atlas đều chuyển quyền về user ở bước
thanh toán):

1. Agent gọi `add_to_cart` → server tạo giỏ riêng (`carts.session_token = "agent:<id>"`).
2. Tool trả `shareUrl: /gio-hang/<single-use-token>` (24h).
3. Người dùng mở link → `/api/v1/cart/claim` gộp giỏ vào trình duyệt → **tự bấm thanh toán**.

Agent có thể chuẩn bị cả giỏ, tư vấn so sánh, kiểm tra tồn kho — nhưng không bao
giờ giữ quyền chi tiền. Đơn VNPay/COD chỉ sinh ra khi người dùng submit form checkout.

## Bảo mật

- **Tool args validate bằng zod** (mirror từ JSON Schema) — sai shape → 400 `INVALID_TOOL_ARGS` kèm `fields`.
- **Rate-limit theo (tool, agentId)** qua Redis `incrWithTtl`, fail-open khi cache chết.
- **Giá luôn từ DB** — tool không nhận giá từ client/agent (chống tool poisoning giá).
- **Giỏ agent tách khỏi giỏ user** — session_token namespace `agent:`, không đụng cookie user.
- **Không expose gì không công khai**: track_order chỉ trả metadata, không địa chỉ/email (giữ nguyên policy IDOR của `/orders/ref/:code`).
- robots.txt: AI crawler (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) được đọc `llms.txt`, `llms-full.txt`, `/api/v1/agent/*` — trỏ về nguồn có cấu trúc thay vì scrape SPA (chống epistemic recursion).

## Kiến trúc

```
server/routes/agentTools.js   — tool registry (đơn nguồn: discovery + invoke + plugin manifest)
server/awil.js                — render agent.json / ai-plugin.json / llms.txt / llms-full.txt
server/server.js              — mount /.well-known/*, /llms*.txt + /api/v1/agent (tools trước chat)
ops/nginx.conf                — cache llms.txt 10m, agent tools chặt hơn catalog
public/robots.txt             — policy cho AI crawlers
```

Registry là nguồn đóng (không nhận schema từ ngoài) — mọi tool định nghĩa 1 chỗ
`TOOLS = [...]`, mỗi tool có `inputSchema` (JSON Schema) + `handler` + `rateLimit`.
Thêm tool = thêm 1 object vào mảng, discovery/manifest/test tự theo.

## Test

```bash
# server phải chạy (API_URL=http://localhost:3100 node server.js)
npm run test:agent-tools
```

15 test: discovery shape, schema validation, human-in-the-loop (shareUrl claim
thật), rate-limit path, OUT_OF_STOCK từ DB, manifests, llms.txt, robots.txt.

## Tham chiếu

- Build the web for agents, not agents for the web — arXiv 2506.05567 (Lù et al., 2025)
- Towards an Agent-First Web (2026)
- WebMCP — W3C Web Machine Learning CG (incubation, chưa chuẩn)
- llms.txt — llmstxt.org
- X-Cache header test: `curl -sI /llms.txt` qua edge nginx.
