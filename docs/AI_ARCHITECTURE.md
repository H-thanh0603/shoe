# KINETIC — Provider-Agnostic AI/Agent Architecture

Kiến trúc AI provider-agnostic cho KINETIC, tích hợp architecture của
[anthropics/commerce-agents](https://github.com/anthropics/commerce-agents)
(Blueprint) mà **không耦 coupling vào Anthropic**.

> Tài liệu này là thiết kế & vận hành. Hướng dẫn cấu hình từng provider:
> `docs/AI_PROVIDERS.md`.

## 0. Nguyên tắc

1. **Commerce logic không biết provider tồn tại.** Agent (prompt, tools, loop,
   gates) chỉ nói "chat + tool-calling" qua một interface chung.
2. **Không SDK nào của provider được import trong agent/business logic.** SDK
  /API chỉ xuất hiện trong thư mục `server/services/ai/providers/`.
3. **Đổi provider = đổi env, không sửa code.** `AI_PROVIDER=deepseek` →
   `AI_PROVIDER=openrouter` không chạm tới agent code.
4. **Blueprint là tham chiếu, không phải runtime dependency bắt buộc.** Các
   concept (skills, gates, staged changes, human-in-the-loop) được port vào
   Node; Python blueprint vẫn chạy được nếu muốn (qua internal gateway).

```
Application (React SPA / Admin)
      ↓ REST + SSE (api/v1/assistant, api/v1/agent/chat)
Express Backend
      ↓ Agent Service Layer (Node)
Agent Runtime (loop, tool-calls, gates, events)     ← commerce logic thuần
      ↓ AIProvider interface (generate / stream / tools)
Provider Abstraction (registry + capability + fallback)
      ↓
┌────────────┬─────────────┬─────────────┬────────────┬─────────────┐
│ anthropic  │ openai      │ openrouter  │ tokenrouter│ gemini      │
│ (native)   │ +compatible │ (openai-c)  │ (openai-c) │ (native)    │
└────────────┴─────────────┴─────────────┴────────────┴─────────────┘
      ↓ HTTP
LLM Models
```

## 1. Hai đường tích hợp Blueprints

KINETIC giữ **2 đường chạy agent** — cùng dùng một provider layer:

### 1a. Node agent runtime (mặc định — "native")

Port các concept chính của commerce-agents sang Node, chạy trong process
Express:

- **Shopping assistant** (public): `search → compare → recommend → add_to_cart`
  qua tool registry AWI đã có (`server/routes/agentTools.js`). Làm theo flow
  "search-discovery" + "purchase-research" của Blueprint shopping-agent.
- **Merchant assistant** (admin): đọc analytics/stock, **stage change** vào DB
  (`agent_changes` — đã có), host duyệt ở Admin. Theo flow merchant-agent
  (metrics → stage → approval) — không apply trực tiếp, đúng triết lý
  `require_host_approval`.

### 1b. Python blueprint (optional — chạy thử chuyên sâu)

`agents/kinetic_agents.py` hiện trỏ DeepSeek qua LiteLLM proxy. Thay bằng trỏ
vào **internal Anthropic-format gateway** của Node server (`/api/v1/internal/llm/messages`)
— bỏ được LiteLLM, bỏ được anthropic package phụ thuộc vendor API thật, mọi
provider cấu hình từ `server/.env`.

## 2. Lớp provider abstraction (Node)

`server/services/ai/` — mọi file mới, không đụng đến logic cũ.

| File | Trách nhiệm |
|---|---|
| `types.js` | Contract chung: `ChatMessage`, `ToolSpec`, `ChatRequest`, `ChatResult`, `StreamEvent`, `ProviderInfo`, `AIError` |
| `registry.js` | Map `AI_PROVIDER` → adapter; expose `activeProvider()`, `fallbackChain()`, `configSnapshot()` (không key) |
| `anthropic.js` | Adapter Anthropic Messages API native (`/v1/messages`), SSE stream, tool-calling, prompt-cache fields |
| `openai-compat.js` | Adapter dùng chung cho **mọi** API OpenAI-compatible: deepseek, openrouter, tokenrouter, groq, together, ollama, vllm…  Config theo env (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`); convert Anthropic⇄OpenAI tool format qua `convert.js` |
| `gemini.js` | Adapter Google Gemini native (`generateContent` + tool-calling OpenAPI-style function declarations) |
| `mock.js` | Provider test/offline: deterministic, scriptable tool-calls — dùng trong unit test + fallback chót khi không có key nào |
| `client.js` | `aiChat()` / `aiStream()` / `aiCallTools()` — phân giải provider chain, retry (429/5xx/timeout), fallback, timeout, thống kê usage, redacted logging |
| `convert.js` | Conversions: Anthropic ⇄ OpenAI ⇄ Gemini messages/tools/usage/stream events |
| `log.js` | Structured AI logging: provider/model/latency/usage/errors/fallback — **không log key, không log secrets, không log full prompt ở INFO** |
| `capabilities.js` | Per-model capability store: streaming, tool calling, parallel calls, structured output, vision, reasoning; degrade gracefully khi provider/model thiếu capability |

### 2.1 Chuẩn hoá nội bộ (internal message standard)

Chuẩn nội bộ là **Anthropic Messages format** (messages + content blocks +
tool_use/tool_result), vì:
- Blueprint runtime tiêu thụ format này trực tiếp (zero conversion khi bridge
  Python chạy qua gateway).
- Format content-block hỗ trợ streaming tool input tốt hơn plain string.
- Convert sang OpenAI/Gemini nằm gọn trong `convert.js`.

Vì vậy `ChatRequest` nội bộ:

```js
{
  model,            // resolved tại client.js theo provider
  system,           // string | blocks
  messages,         // [{role, content: string | blocks}]
  tools,            // [{name, description, input_schema}]
  maxTokens, temperature,
  toolChoice,       // 'auto' | 'none' | {name}
  requestId,        // observability
  // capability hints
}
```

### 2.2 Capability-aware

```js
capabilities.js:
  {
    streaming: true,        // model có stream SSE không
    toolCalling: true,      // tool/function calling
    parallelToolCalls: true,
    structuredOutput: true,  // json_schema response_format
    vision: false,
    reasoning: false,       // thinking/reasoning tokens
  }
```

Provider adapter khai báo capability defaults; registry hợp nhất với
per-model overrides từ env (`AI_MODEL_CAPABILITIES`, JSON). Khi một request cần
capability provider không có:
- **streaming**: fall back về non-streaming (client.js tự queue đầy đủ text rồi
  emit một `text` event) — frontend không biết sự khác biệt.
- **toolCalling**: agent runtime không register tools → prompt có hướng dẫn
  "không có tool, trả lời theo kiến thức + apologies"; hoặc ref configured
  `AI_REQUIRE_TOOLS=true` thì lỗi rõ ràng.
- **structuredOutput**: dùng tool-call để ép JSON (pattern chuẩn) hoặc bỏ field.
- **parallelToolCalls: false**: runtime tuần tự hoá tool calls trong 1 round.

### 2.3 Fallback chain

`AI_PROVIDER_FALLBACKS=openrouter,deepseek` (danh sách provider thứ hai trở
đi, dùng khi primary lỗi **không phải do nội dung** — 400 validation error
không fallback). Trước khi fallback:
- Retry same-provider theo backoff: 429 (rate limit) + 5xx + network, tối đa
  `AI_MAX_RETRIES` (default 3), backoff+jitter, tôn trọng `Retry-After`.
- Retry **không áp dụng** cho streaming đã emit text (đã lỡ user) — chỉ retry
  khi chưa emit gì.

Tránh infinite loop: chain là list phẳng có thứ tự, mỗi provider tối đa
`AI_MAX_RETRIES`, vượt → sang provider kế; hết chain → `AIError` với
`attempts` trace. Không fallback với POST-style tool-write khi đã side-effect
trên provider cũ — nhưng vì tool **execution** luôn ở Node (provider chỉ sinh
text), side-effect không thể xảy ra ở provider layer.

### 2.4 Observability

Mọi model call log 1 dòng structured (console + requestId):

```
ai call provider=deepseek model=deepseek-chat latency_ms=8123 in=1234 out=567 stream=true req=<rid> agent=shopping
ai fallback provider=openrouter→deepseek reason=429 after_retries=3 req=<rid>
ai error provider=gemini code=TIMEOUT req=<rid> msg="..."
```

DEBUG log request/response đã redact (không key). `/metrics` bổ sung counter
`ai.calls/ai.errors/ai.fallbacks` (fail-open).

## 3. Agent Runtime (Node)

`server/services/agent/`:

| File | Trách nhiệm |
|---|---|
| `runtime.js` | Vòng agent: system prompt → LLM call (stream) → tool_use → execute tool → tool_result → loop; giới hạn vòng `maxRounds` (8); emit events (text_delta, tool_call, tool_result, progress, turn_complete, error) đúng theo semantics của Blueprint events |
| `tools.js` | Adapter cho AWI tool registry: lấy TOOLS từ `agentTools.js`, bọc handler trong validation + fencing (truncate kết quả lớn, JSON serialize, chèn fence như Blueprint fencing) + progress; tool interface độc lập provider: `{name, description, inputSchema, handler}` |
| `sessions.js` | In-memory session store (LRU, TTL) cho assistant chat: history + cart-hints; production-ready slot giới hạn (mỗi session max turn) |
| `policy.js` | Gates theo concept Blueprint: require-host-approval cho hành vi ghi (agent chỉ add_to_cart + shareUrl, không checkout) |
| `prompts.js` | System prompts port từ Blueprint shopping/merchant: tiếng Việt, brand voice KINETIC, định dạng giá VND, grounding rules |

Events (SSE ra frontend): `text` (delta), `tool` (tên tool + label), `tool_result` (status ok/error/blocked), `turn_complete` (usage), `error`. Frontend chỉ thấy events trung tính với provider — không lộ tên model của provider hay internal endpoint.

### 3.1 Runtime flow (một turn)

```
User msg → sessions.get(sid) → runtime.runTurn()
  → aiStream(request với tools)         ← provider layer
  → text_delta → SSE
  → tool_use block(s)                   ← provider layer đã chuẩn hoá
  → runtime gọi tool.handler (Node, DB)  ← không qua provider
  → tool_result → SSE + append history
  → loop tới end_turn / maxRounds
  → turn_complete {usage}
```

### 3.2 Human-in-the-loop (giữ nguyên policy KINETIC)

- `add_to_cart` tool của assistant tạo giỏ server-side `agent:<id>` và trả
  `shareUrl` — người dùng claim giỏ rồi tự checkout (đã có UI `/gio-hang/:token`).
- Merchant staging: agent gọi tool stage → ghi DB `agent_changes` (status
  `staged`) → host duyệt trong Admin tab "DUYỆT CHANGE" (đã có).
- Không tool checkout/payment cho agent — đúng chính sách hiện tại.

## 4. Internal LLM Gateway (cho Python blueprint)

Route nội bộ: `POST /api/v1/internal/llm/messages` (chỉ bind loopback /
protected bằng `INTERNAL_LLM_SECRET` header).

- **Input**: Anthropic Messages format request (đúng như AsyncAnthropic của
  blueprint gửi).
- **Processing**: parse → provider chain (từ `server/.env`) → stream về
  **Anthropic SSE event format** (`message_start`, `content_block_start`,
  `content_block_delta` with `text_delta`/`input_json_delta`,
  `content_block_stop`, `message_delta`, `message_stop`).
- **Kết quả**: blueprint (không sửa) thay `AsyncAnthropic(base_url=...)` trỏ
  vào gateway — chạy với **mọi provider cấu hình trong Node**, không cần
  LiteLLM, không cần anthropic SDK trỏ production API.

Đây là điểm neo quan trọng: **interface Anthropic-format chỉ là wire protocol
thứ 3**, một trong các protocol converter — không phải dependency vào dịch vụ
Anthropic. Provider thật đứng sau gateway hoàn toàn do env quyết định.

## 5. Chuẩn bị production

- Keys chỉ ở `server/.env` (server-side). Frontend không bao giờ thấy key.
- Frontend nói chuyện với backend qua REST/SSE chuẩn; không chạm provider.
- Rate limit: assistant theo user/IP; gateway theo secret + IP nội bộ.
- SSE qua nginx: `X-Accel-Buffering: no` đã có pattern ở agentTools stream.
- Cost control: `AI_MAX_TOKENS` (default 2048), `AI_MAX_ROUNDS` (8),
  max tool args size, session turn cap, per-user rate limit đã có.
- Khả năng scale: sessions in-memory theo process — sticky session hoặc move
  sang Redis khi cần (đã có `services/cache.js` pattern). Multi-instance
  deploy: gateway stateless (chỉ convert + forward) — scale ngang được.

## 6. Testing strategy

1. **Unit (offline)**: convert Anthropic⇄OpenAI⇄Gemini shapes, capability
   resolution, fallback logic với mock fetch, registry env parsing. Không
   network.
2. **Agent runtime (offline)**: mock provider scriptable (kịch bản tool-call
   sequence) → assert event order, tool fencing, session cap, maxRounds.
3. **Gateway (offline)**: POST Anthropic-format request → mock provider →
   assert SSE event sequence chuẩn Anthropic.
4. **Live (nếu có key)**: `node server/test/ai-providers.live.test.js` — mỗi
   provider thật gọi 1 text + 1 tool-call; đổi `AI_PROVIDER` giữa các run
   không sửa logic. (DeepSeek key có sẵn trong `agents/.env` để smoke.)
```

## Cập nhật sau hiện thực (implementation notes)

1. **Gateway route**: SDK `anthropic` POST tới `<base_url> + /v1/messages` —
   gateway expose cả `/messages` lẫn `/v1/messages` (cùng handler), nên
   `KINETIC_LLM_BASE_URL=http://127.0.0.1:3000/api/v1/internal/llm` là đủ.
2. **`ASSISTANT_PROVIDER` đổi default**: `deepseek` (qua LiteLLM proxy :4000)
   → `gateway` (Node gateway trực tiếp). LiteLLM proxy + `run_proxy.sh` không
   cần nữa — giữ lại cũng không sao (không ai gọi).
3. **Sự kiện stream nội bộ** có thêm `tool_use_start` (adapter Anthropic emit
   khi gặp content_block tool_use) — runtime hiện chỉ consume text_delta /
   tool_input_delta / final; `tool_use_start` dành cho UI hiển thị tool call
   chờ input.
4. **Session store**: LRU + TTL in-memory (`services/agent/sessions.js`);
   multi-instance production → thay bằng Redis (interface get/create/append/
   bumpTurn/atLimit đã gom đủ).
5. **Turn cap**: session quá `AI_MAX_TURNS` (default 30) → assistant trả
   thông điệp "tải lại trang" thay vì im lặng (lỗi 429-friendly theo pattern
   bridge cũ).
