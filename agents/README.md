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
# (pip thường cũng được nếu có)

# 2. DB + server KINETIC
npm run db:migrate --prefix server
PORT=3100 node server/server.js   # 3000 hay bị project khác chiếm

# 3. Smoke test (29 checks, không gọi model, không tốn tiền)
KINETIC_API=http://localhost:3100 \
KINETIC_ADMIN_PASSWORD=<mật khẩu admin> \
./agents/run_smoke.sh
```

Biến môi trường (`agents/.env.example` không có — tự export):

| Biến | Mặc định | Dùng cho |
|---|---|---|
| `KINETIC_API` | `http://localhost:3000` | base API cho cả 2 adapter |
| `KINETIC_WEB_URL` | `http://localhost:3000` | link handoff checkout + tracking đơn |
| `KINETIC_ADMIN_EMAIL` | `admin@kinetic.vn` | merchant login |
| `KINETIC_ADMIN_PASSWORD` | (bắt buộc) | merchant login |
| `BLUEPRINT_DIR` | `/tmp/commerce-agents` | `run_smoke.sh` dựng PYTHONPATH |

## Chạy agent thật (cần ANTHROPIC_API_KEY)

```python
from pathlib import Path
from shopping_agent_runtime import ShoppingAgent
from kinetic_agents import KineticStorefront, kinetic_shopping_config

agent = ShoppingAgent(backend=KineticStorefront(),
                      skills_dir=Path("/tmp/commerce-agents/shopping-agent/skills"),
                      config=kinetic_shopping_config())
async for event in agent.stream_turn(messages, session, state):
    ...  # text_delta, tool_call, ui, cart_update, turn_complete
```

Merchant tương tự với `MerchantAgent`, `KineticMerchant()`,
`kinetic_merchant_config()` — mọi ghi (`apply_change`) đều qua
`require_host_approval`, operator duyệt trên UI của host.

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
