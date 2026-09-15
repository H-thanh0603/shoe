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
| `get_user_voucher` | Đọc | 20/phút | Mã giảm giá **công khai** đang chạy + preview mức giảm theo `subtotal`. KHÔNG áp mã hộ — khách tự nhập ở checkout. |
| `claim_and_attach_cart` | Ghi | 12/phút | Đính `shareUrl` (do `add_to_cart` cùng phiên tạo) vào dòng chat để khách bấm nút nhận giỏ. Provenance gate: chỉ token do phiên này sinh mới được đính. |
| `get_memory` | Đọc | 30/phút | Xem ghi nhớ về khách (brand/size/ngân sách/mục đích) của phân vùng hiện tại. |
| `save_memory` | Ghi | 12/phút | Lưu preference khách — chỉ 5 key whitelist (`preferred_brand`, `shoe_size`, `budget`, `preferred_purpose`, `preferred_style`). Không nhận key nhạy cảm (thẻ/địa chỉ/mật khẩu). |

**Không có tool checkout/payment** — cố tình. Workflow `draft_order` (`server/services/agent/workflows.js`) chạy chuỗi recommend → check_stock → add_to_cart → get_user_voucher → claim_and_attach_cart thành 1 macro, nhưng vẫn qua đúng `executeTool` (mọi gate policy/provenance/rate-limit vẫn áp) và dừng ở handoff link — đơn chỉ sinh khi người dùng tự bấm thanh toán. Xem chính sách dưới.

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
server/routes/agentTools.js   — tool registry (đơn nguồn: discovery + invoke + stream + plugin manifest)
server/services/match.js      — match engine server-side (port src/lib/match.js — giữ sync công thức)
server/services/agent/memory.js     — Agent Memory: preference khách (whitelist 5 key, explicit đè inferred)
server/services/agent/activity.js   — AI Activity Log: ghi mọi tool call của runtime (ok/error/blocked)
server/services/agent/workflows.js  — macro draft_order qua executeTool (không đường tắt vượt policy)
server/awil.js                — render agent.json / ai-plugin.json / llms.txt / llms-full.txt
server/server.js              — mount /.well-known/*, /llms*.txt + /api/v1/agent (tools trước chat)
ops/nginx.conf                — cache llms.txt 10m, agent tools chặt hơn catalog + SSE không buffer
public/robots.txt             — policy cho AI crawlers
```

Registry là nguồn đóng (không nhận schema từ ngoài) — mọi tool định nghĩa 1 chỗ
`TOOLS = [...]`, mỗi tool có `inputSchema` (JSON Schema) + `handler` + `rateLimit`.
Thêm tool = thêm 1 object vào mảng, discovery/manifest/test tự theo.

`recommend_products` dùng cùng công thức quiz web (services/match.js ↔ src/lib/match.js):
khi đổi một bên, đổi bên kia — comment đầu 2 file nhắc sync.

## Test

```bash
# server phải chạy (API_URL=http://localhost:3100 node server.js)
npm run test:agent-tools
```

19 test: discovery shape, schema validation, human-in-the-loop (shareUrl claim
thật), rate-limit path, OUT_OF_STOCK từ DB, recommend match engine, SSE stream
(progress/result/error), manifests, llms.txt, robots.txt.

## Tham chiếu

- Build the web for agents, not agents for the web — arXiv 2506.05567 (Lù et al., 2025)
- Towards an Agent-First Web (2026)
- WebMCP — W3C Web Machine Learning CG (incubation, chưa chuẩn)
- llms.txt — llmstxt.org
- X-Cache header test: `curl -sI /llms.txt` qua edge nginx.

## Test qua edge (Docker Compose)

```bash
# 1. Lên stack đầy đủ (postgres+redis+app+edge:8081)
JWT_SECRET=<hex> docker compose up -d --build

# 2. Smoke test hạ tầng edge: cache llms.txt MISS→HIT, SSE không buffer,
#    tool call không cache, agent page serve đúng
API_URL=http://localhost:8081 npm --prefix server run test:edge
```

Lưu ý môi trường nhiều service dùng chung port: nếu host 5433 bận, override
`postgres.ports: !reset []` (app trong compose nối qua network nội bộ, không cần
host port).
