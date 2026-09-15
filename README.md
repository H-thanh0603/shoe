# KINETIC — Shoe E-commerce

E-commerce giày thể thao: React 19 + Vite frontend, Express + PostgreSQL backend, VNPay sandbox, Redis cache/rate-limit, RBAC admin, jobs queue.

**Agent layer (Agentic Web Interface)**: website expose tools cho AI agent — `/.well-known/agent.json`, `llms.txt`, `/api/v1/agent/tools` (12 tools: search/stock/compare/reviews/voucher/add_to_cart/memory với human-in-the-loop). Workflow agentic `draft_order` chuẩn bị đơn qua macro recommend → cart → voucher → handoff link (không checkout hộ). Chi tiết: `docs/AGENT_LAYER.md`.

**Agent Memory + AI Activity Log**: trợ lý nhớ preference khách (brand/size/ngân sách, whitelist 5 key, explicit đè inferred, `agent_memory`) và mọi tool call được log (`ai_activity_log`, admin tab HOẠT ĐỘNG AI).

**AI layer (provider-agnostic)**: trợ lý mua giày (`/api/v1/assistant`) chạy agent loop Node với tool-calling, streaming SSE — LLM provider đổi bằng env (`deepseek` | `openrouter` | `anthropic` | `openai` | `gemini` | `tokenrouter` | `mock` | custom OpenAI-compatible), kèm retry + fallback chain, KHÔNG ghép SDK nào vào business logic. Python bridge (blueprint commerce-agents) giờ chạy qua internal gateway `POST /api/v1/internal/llm/messages` — hết cần LiteLLM proxy. Chi tiết: `docs/AI_ARCHITECTURE.md` (thiết kế) + `docs/AI_PROVIDERS.md` (cấu hình/đổi provider).

## Chạy dev

```bash
# backend (cần PostgreSQL đang chạy; cấu hình trong server/.env — xem server/.env.example)
cp server/.env.example server/.env   # sửa DATABASE_URL, JWT_SECRET
npm --prefix server run dev          # API http://localhost:3000 (server tự migrate + seed)

# frontend
npm install
npm run dev                          # Vite http://localhost:5173, proxy /api -> :3000
```

## Chạy production (Docker Compose)

```bash
cp .env.example .env                 # VITE_API_TARGET
export JWT_SECRET=<random-hex>       # compose đọc env này
docker compose up --build            # postgres + redis + app + worker + cron + backup + edge nginx
# edge: http://localhost:8081, app scale: docker compose up --scale app=2
```

## Test

```bash
npm --prefix server test             # 14 test: coupon, stock race, idempotency, vnpay sign, rbac, auth
```

## Tài liệu

Chi tiết trong `docs/`: API, AUTH, DEPLOYMENT, SECURITY, BACKUP, TESTING, ARCHITECTURE, DATABASE, PAYMENT (VNPay), CDN_WAF, INVENTORY.

## Cấu trúc chính

```
src/          React SPA (history router, Tailwind 4, three.js lazy)
server/       Express API + jobs worker + cron + migrations
ops/          nginx edge (LB + cache + rate-limit)
docs/         runbooks vận hành
```
