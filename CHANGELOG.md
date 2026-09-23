# CHANGELOG

Mọi thay đổi đáng chú ý của KINETIC. Format theo [Keep a Changelog](https://keepachangelog.com/),
phiên bản theo ngày release (dự án cá nhân, tag theo YYYY-MM-DD).

## 2026-09-23 — Dọn nợ documented + mở rộng catalog 66 sp + PITR drill job

### Sửa
- **Agent policy COD→VNPay** (`agents/kinetic_agents.py`): trả lời "chỉ nhận
  COD" đã lỗi thời từ 2026-09-12 — giờ nói đúng COD + VNPay + mã đơn KIN.
- **2 bug adapter Python** (smoke bắt được, 35/35 pass): `vnd()` thiếu định
  nghĩa làm `get_order_issues` chết `NameError`; client không gửi
  `X-CSRF-Token` → mọi write (PUT/PATCH/DELETE) bị middleware CSRF §45 chặn
  từ khi CSRF được thêm vào. Sửa trong `call()` — echo cookie `csrf` cho write.
- **`agents/README.md`**: thay hướng dẫn LiteLLM proxy bằng gateway nội bộ
  Node (`ASSISTANT_PROVIDER=gateway` mặc định) — `run_proxy.sh` chỉ còn là
  phương án phụ; `litellm` ra khỏi requirements (comment optional).

### Thêm
- **Test state machine đơn hàng admin** (`test/admin-transition.test.js`, 5
  test): happy path từng bước, nhảy cóc 409, enum lạ 400, đơn lạ 404, cancel
  hoàn stock + inventory RESTOCK, terminal state — đóng nợ "chưa cover" trong
  `docs/TESTING.md`. Vào CI + `npm run test:admin-transition`.
- **Catalog seed 66 sản phẩm** (trước: 26 — §79 yêu cầu ≥50): bổ sung KINETIC,
  Nike, Adidas, New Balance, Asics, Puma + brand mới Hoka, On, Converse, Vans,
  Reebok, Saucony, Mizuno — đủ purpose running/street/trail/court/daily.
- **Job `pitr_drill`** (`services/jobs.js`, migration `026`): backup định kỳ
  `pg_basebackup` (physical) với fallback tự động `pg_dump -Fc` (logical) khi
  role thiếu REPLICATION; cron enqueue khi set `PITR_BASE_DIR`. Đã drill thật
  trên dev (logical, restore-được — `docs/BACKUP_DRILLS.md`).

## 2026-09-15 — Agentic commerce round 2: Memory, Activity Log, draft_order

### Thêm
- **Agent Memory** (`agent_memory`, `services/agent/memory.js`): trợ lý nhớ
  preference khách (whitelist 5 key: brand/size/budget/purpose/style;
  explicit đè inferred), phân vùng `user:<id>` / `anon:<ip-hash>`,
  nạp vào system prompt ở turn đầu.
- **Tools mới** trong registry AWI (12 tools): `get_user_voucher` (mã công
  khai + preview giảm theo subtotal, KHÔNG áp hộ), `claim_and_attach_cart`
  (đính nút nhận giỏ vào chat, provenance gate theo token do phiên tạo),
  `get_memory` / `save_memory`.
- **Workflow `draft_order`** (`services/agent/workflows.js`): macro
  recommend → check_stock → add_to_cart → voucher → handoff qua
  `executeTool` (không đường tắt vượt policy) — dừng ở shareUrl.
- **AI Activity Log** (`ai_activity_log`, `GET /admin/ai-activity[ /stats]`
  perm `agent:read`, admin tab HOẠT ĐỘNG AI): mọi outcome tool call của
  runtime (ok/error/blocked) được await ghi trước khi trả kết quả.
- Session multi-instance sync thêm `seenShareUrls` (provenance handoff
  chia sẻ giữa replica).

## 2026-09-14 — Production hardening + AI agent layer

### Thêm
- **AI layer provider-agnostic** (`services/ai/`): interface `AIProvider` + 7
  adapter (anthropic, openai-compat ×4, gemini, mock), retry/backoff, fallback
  chain, capability store — không lock-in một vendor nào.
- **Agent runtime** (`services/agent/`): turn loop maxRounds, tools qua AWI
  registry + zod mirror, SSE stream (text/plan/step_done/turn_complete),
  prompt tiếng Việt, explicit planning (`<plan>` steps) + progress UI.
- **Security hardening agent**: provenance gate cho `add_to_cart` (port
  gates.py), fence sanitize chống prompt-injection qua review/tool output,
  per-session seenSlugs.
- **Session store multi-instance**: redis mode (`AI_SESSION_STORE=redis|auto`)
  — history + turn cap + provenance share giữa replica, fail-open về memory.
- **Internal LLM gateway**: `/api/v1/internal/llm/messages` (+`/v1/messages`)
  cho agents/_blueprint bên ngoài, secret header, fail-closed.
- **PII at rest**: AES-256-GCM `services/pii.js` cho customer name/phone/
  email/address trong orders (migrate dần, off khi chưa set `PII_KEY`).
- **VNPay refund thật** (API v2.1.1): admin hủy đơn đã paid → tự hoàn tiền,
  trạng thái `refund_pending/refunded/refund_failed` + note + audit.
- **Alerting**: `scripts/alert.js` + compose service `alerter` mỗi 60s —
  healthz/readyz/jobs failed/AI error rate → Telegram, cooldown 30p.
- **Benchmark**: `scripts/bench.js` (0 dep) — p50/p95/p99 + CI gate exit 2.
- **Admin**: tab BÁO CÁO (chart series 7/30/90 ngày + top + tồn thấp),
  CRUD danh mục (collections) UI + API.
- **A11y**: skip-to-content, `:focus-visible` toàn cục, `prefers-reduced-motion`,
  aria-label đủ, placeholder contrast đạt AA (5.31:1).

### Sửa
- nginx: SSE rule cho assistant (proxy_buffering off), 4 security headers edge.
- Refresh token rotation reuse-detection được ghi nhận đúng trong SECURITY.md
  (đã có từ trước, doc cũ sai); trust proxy tương tự.
- Test flaky executeTool (giỏ agentId cố định tích 14 đôi) — agentId unique.
- `npm test` giờ chạy trọn bộ (105 tests, 11 file).

### Kiến trúc quyết định
- Không RLS Postgres (1 role DB + chỉ API server nối — bằng chứng trong
  SECURITY.md mục #7; điều kiện bậc thang khi nào nên bật).

## 2026-09-13 — Scale + security edge

- nginx edge: cache /uploads 30d, sitemap 1h; CSRF double-submit middleware;
  api.js 401→refresh→retry single-flight; upload resize client 1600px/JPEG
  q0.85; bundle main 1.08MB→120KB (lazy Admin/three.js/animejs); AWI tool
  registry + llms.txt + `recommend_products` (match engine port).

## 2026-09-12 — E-commerce core hoàn chỉnh

- VNPay sandbox (HMAC-SHA512 return/IPN), email SMTP xác nhận đơn (jobs
  queue), admin upload ảnh binary, history router + SEO per-product,
  wishlist + sold/wishlist count thật, compare verdict theo profile quiz,
  social-proof feed thật, AR thử giày webcam, size gợi ý từ dữ liệu bán,
- track đơn SVG map, share hóa đơn PNG, live stock ticker, verified review.

## 2026-09-10 — Bước 6-7: auth + cá nhân hoá

- Auth JWT (register/login/logout/me + merge guest cart), RBAC perm table,
  product DNA (purpose/scores), Shoe Profile quiz, match engine client,
  adaptive homepage theo thời tiết/thời gian, secret mode.
- Test node:test cho coupon/stock-race/idempotency; PostgreSQL migrations +
  seed 26 sản phẩm 6 brand.

## 2026-09-01 — Khởi tạo

- Homepage UI futuristic streetwear, Express + sqlite → PostgreSQL, API v1
  envelope + pagination, ProductDetail + cart, checkout + coupon, admin API,
  BACKEND spec + phases.
