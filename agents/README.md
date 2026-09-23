# KINETIC × commerce-agents

Adapter `StorefrontBackend` + `MerchantBackend` của blueprint
[anthropics/commerce-agents](https://github.com/anthropics/commerce-agents)
trỏ vào API Express của shop (`server/routes/*`). Không cần API key để test
adapter — chỉ cần khi chạy agent thật với model.

## Setup

```bash
# 1. Blueprint (đọc + cài packages, không sửa gì trong đó)
git clone --depth 1 https://github.com/anthropics/commerce-agents.git ~/commerce-agents
uv venv ~/.venvs/kinetic-agents
~/.venvs/kinetic-agents/bin/pip install -r agents/requirements.txt

# 2. DB + server KINETIC
npm run db:migrate --prefix server
PORT=3100 node server/server.js   # 3000 hay bị project khác chiếm

# 3. Smoke test (35 checks, không gọi model, không tốn tiền)
set -a; source agents/.env; set +a
./agents/run_smoke.sh

# 4. Chat demo (cần provider — gateway nội bộ hoặc Anthropic, xem dưới)
~/.venvs/kinetic-agents/bin/python agents/run_demo.py [--merchant]
```

Biến môi trường: copy `agents/.env.example` thành `agents/.env` (không commit).

| Biến | Mặc định | Dùng cho |
|---|---|---|
| `KINETIC_API` | `http://localhost:3000` | base API cho cả 2 adapter |
| `KINETIC_WEB_URL` | `http://localhost:3000` | link handoff checkout + tracking đơn |
| `KINETIC_ADMIN_EMAIL` | `admin@kinetic.vn` | merchant login |
| `KINETIC_ADMIN_PASSWORD` | (bắt buộc) | merchant login |
| `BLUEPRINT_DIR` | `~/commerce-agents` | `run_smoke.sh` dựng PYTHONPATH |

## Chạy agent thật — gateway nội bộ hoặc Anthropic

`agents/run_demo.py` dựng sẵn agent + console chat. Provider chọn bằng 1 biến
`ASSISTANT_PROVIDER` trong `agents/.env`:

- **`gateway` (mặc định)** — đi qua Node gateway của server KINETIC
  (`/api/v1/internal/llm/messages`, wire format Anthropic Messages đầy đủ:
  streaming SSE, tool-use block). Provider/model thật cấu hình ở `server/.env`
  (deepseek, openrouter, gemini, openai, … — xem `docs/AI_PROVIDERS.md`);
  đổi provider KHÔNG đụng `agents/`. Bật bằng:
  `INTERNAL_LLM_SECRET=<random>` trong `server/.env` và
  `KINETIC_LLM_API_KEY=<cùng giá trị>` trong `agents/.env`
  (gateway fail-closed khi chưa set secret).
- **`anthropic`** — gọi API Anthropic trực tiếp: `ANTHROPIC_API_KEY=sk-ant-...`,
  model mặc định blueprint (`claude-sonnet-5` shopping / `claude-opus-5`
  merchant, đổi qua `KINETIC_SHOPPING_MODEL` / `KINETIC_MERCHANT_MODEL` nếu cần).

Model `deepseek-reasoner` bị chặn ngay ở config vì tool-use kém (dù đi qua
gateway hay API gốc). Cầu nối cũ qua LiteLLM proxy :4000 (`run_proxy.sh`) không
còn cần — giữ lại chỉ làm phương án phụ.

Config (`kinetic_shopping_config` / `kinetic_merchant_config`) set full field:
caps khớp backend (cart tối đa 10/món, giá ±20%, promo ≤50%, nhập kho ≤500),
`require_host_approval=True`, và **lexicon tiếng Việt** nối vào grounding
terms (`đổi size`, `tra cứu`, `doanh thu`, `duyệt`...) để gate trigger đúng
khi khách/operator nói tiếng Việt. Provider chọn bằng 1 biến
`ASSISTANT_PROVIDER=gateway|anthropic`; model `deepseek-reasoner` bị chặn
ngay ở config vì tool-use kém. HTTP client retry GET 429/5xx (không retry
POST/PATCH/DELETE để tránh tạo đơn trùng).

## Ngưỡng tốt nghiệp khỏi gateway nội bộ

Gateway Node đã thay LiteLLM proxy (từ 2026-09-14 — `run_proxy.sh` giờ chỉ là
phương án phụ). Đường `gateway` đủ cho pilot: streaming token-level, tool-use,
retry + fallback đa provider đều nằm trong Node (`docs/AI_ARCHITECTURE.md`).
Cân nhắc rời gateway chỉ khi: agent cần wire format không phải Anthropic, cần
gọi model ở mạng ngoài mà server không reach được, hoặc cần tách agent thành
tiến trình riêng với SLA riêng — lúc đó thay đúng lớp client HTTP, giữ nguyên
adapters, configs và toàn bộ method backend.

## Ánh xạ & giới hạn đã biết

- Family id = product `slug`; variant id = `slug::size` (vd `air-vector-01::42`).
- Tiền VND (số nguyên trong float blueprint). Giá checkout agent không chốt —
  `checkout_handoff` trỏ về `/#shop`, host (web) thanh toán như cũ.
- `search_products` text chỉ khớp **tên/thương hiệu** (giới hạn của `ILIKE`
  backend) — lọc purpose/giá làm ở frontend, agent tự hỏi thêm để thu hẹp.
- Guest không có lịch sử đơn (`get_orders` rỗng); tra cứu đơn theo mã
  `KIN-XXXXXX` qua `get_order` vẫn đủ cho "đơn tôi đâu rồi".
- Merchant: `query_metrics` có sales/orders theo ngày (`/admin/analytics/series`),
  traffic-daily không có; `stage_campaign` cho stage nhưng `apply` từ chối
  (chưa có hệ thống campaign — tạo tay); promotion stage → coupon thật khi apply.
- Staged changes nằm **trong RAM tiến trình** — restart là mất. Đủ cho demo;
  production thì lưu DB.
