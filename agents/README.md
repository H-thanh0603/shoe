# KINETIC × commerce-agents

Adapter `StorefrontBackend` + `MerchantBackend` của blueprint
[anthropics/commerce-agents](https://github.com/anthropics/commerce-agents)
trỏ vào API Express của shop (`server/routes/*`). Không cần API key để test
adapter — chỉ cần khi chạy agent thật với model.

## Setup

```bash
# 1. Blueprint (đọc + cài packages, không sửa gì trong đó)
git clone --depth 1 https://github.com/anthropics/commerce-agents.git /tmp/commerce-agents
uv venv /tmp/kinetic-agents/.venv
/tmp/kinetic-agents/.venv/bin/pip install -r agents/requirements.txt

# 2. DB + server KINETIC
npm run db:migrate --prefix server
PORT=3100 node server/server.js   # 3000 hay bị project khác chiếm

# 3. Smoke test (29 checks, không gọi model, không tốn tiền)
set -a; source agents/.env; set +a
./agents/run_smoke.sh

# 4. Chat demo (cần key — Anthropic hoặc proxy, xem dưới)
/tmp/kinetic-agents/.venv/bin/python agents/run_demo.py [--merchant]
```

Biến môi trường: copy `agents/.env.example` thành `agents/.env` (không commit).

| Biến | Mặc định | Dùng cho |
|---|---|---|
| `KINETIC_API` | `http://localhost:3000` | base API cho cả 2 adapter |
| `KINETIC_WEB_URL` | `http://localhost:3000` | link handoff checkout + tracking đơn |
| `KINETIC_ADMIN_EMAIL` | `admin@kinetic.vn` | merchant login |
| `KINETIC_ADMIN_PASSWORD` | (bắt buộc) | merchant login |
| `BLUEPRINT_DIR` | `/tmp/commerce-agents` | `run_smoke.sh` dựng PYTHONPATH |

## Chạy agent thật — Anthropic hoặc DeepSeek

`agents/run_demo.py` dựng sẵn agent + console chat. Key và model lấy từ `.env`:

- **Anthropic trực tiếp:** `ANTHROPIC_API_KEY=sk-ant-...`, model mặc định
  blueprint (`claude-sonnet-5` shopping / `claude-opus-5` merchant, đổi qua
  `KINETIC_SHOPPING_MODEL` / `KINETIC_MERCHANT_MODEL` nếu cần).
- **DeepSeek:** API DeepSeek là format OpenAI nên **không đấu thẳng** vào
  blueprint được (nó gọi Messages API format Anthropic). Cách làm: chạy 1
  proxy dịch (vd [LiteLLM](https://docs.litellm.ai/) —
  `litellm --model deepseek/deepseek-chat`), rồi trỏ agent vào proxy:
  `KINETIC_LLM_BASE_URL=http://localhost:4000/v1`,
  `KINETIC_LLM_API_KEY=...`,
  `KINETIC_SHOPPING_MODEL=deepseek-chat`,
  `KINETIC_MERCHANT_MODEL=deepseek-chat`.
  Mọi gateway tương thích Anthropic (`/v1/messages` + SSE) đều đi đường này.
  Lưu ý: tool-use qua proxy đôi khi kém hơn API gốc — test kỹ trước khi
  production; merchant `enable_analysis` vẫn tắt vì ta chưa có SQL backend.

Config (`kinetic_shopping_config` / `kinetic_merchant_config`) set full field:
caps khớp backend (cart tối đa 10/món, giá ±20%, promo ≤50%, nhập kho ≤500),
`require_host_approval=True`, và **lexicon tiếng Việt** nối vào grounding
terms (`đổi size`, `tra cứu`, `doanh thu`, `duyệt`...) để gate trigger đúng
khi khách/operator nói tiếng Việt. Merchant tương tự với `KineticMerchant()`,
`kinetic_merchant_config()` — mọi ghi (`apply_change`) đều qua mặt duyệt host.

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
