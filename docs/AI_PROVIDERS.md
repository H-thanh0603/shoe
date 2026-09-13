# AI Providers — cấu hình & vận hành

> Kiến trúc tổng quan: `docs/AI_ARCHITECTURE.md`. Tài liệu này là *cách đổi
> provider/model, thêm provider, thêm tool*.

## Tóm tắt 30 giây

```env
# server/.env
AI_PROVIDER=deepseek        # đổi thành openrouter | anthropic | openai | gemini | tokenrouter | mock
AI_MODEL=deepseek-chat      # model của provider đó
DEEPSEEK_API_KEY=sk-...     # key tương ứng
```

Restart server. **Không sửa code ở bất kỳ đâu.** Agent logic, tools, UI, các
route không đổi.

## Provider đang hỗ trợ

| Provider | Wire format | Env model | Env key | Ghi chú |
|---|---|---|---|---|
| `deepseek` | OpenAI-compat (native api.deepseek.com) | `DEEPSEEK_MODEL` | `DEEPSEEK_API_KEY` | Mặc định. `deepseek-reasoner` tự bị chặn tool-calling (capability store). |
| `openrouter` | OpenAI-compat (openrouter.ai) | `OPENROUTER_MODEL` | `OPENROUTER_API_KEY` | Model dạng `vendor/model` (vd `anthropic/claude-sonnet-4.5`, `openai/gpt-4o-mini`). App identity qua `OPENROUTER_APP_URL`/`OPENROUTER_APP_NAME`. |
| `openai` | OpenAI-compat (api.openai.com) | `OPENAI_MODEL` | `OPENAI_API_KEY` | Cũng dùng được cho Azure-compatible endpoint qua `OPENAI_BASE_URL`. |
| `anthropic` | Anthropic Messages native | `ANTHROPIC_MODEL` | `ANTHROPIC_API_KEY` | Không bắt buộc — chỉ 1 trong nhiều provider. |
| `gemini` | Gemini native (functionDeclarations) | `GEMINI_MODEL` | `GOOGLE_API_KEY` (hoặc `GEMINI_API_KEY`) | Schema tool được sanitize tự động (bỏ `$schema`, `additionalProperties`). |
| `tokenrouter` | OpenAI-compat (api.tokenrouter.ai) | `TOKENROUTER_MODEL` | `TOKENROUTER_API_KEY` | Giống OpenRouter về shape; model `vendor/model`. |
| `mock` | Internal | — | — | Không key: trả lời cố định. Dùng dev/CI/demo khi chưa có key. |
| `custom:<name>` | OpenAI-compat bất kỳ | `AI_CUSTOM_<NAME>_MODEL` | `AI_CUSTOM_<NAME>_API_KEY` | Self-host (ollama/vllm/lmstudio) hoặc provider mới: set `AI_CUSTOM_<NAME>_BASE_URL`, `AI_PROVIDER=custom:myvllm`. |

## Cách đổi provider / model

**Provider** — `AI_PROVIDER` trong `server/.env`:

```env
# hôm nay
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat

# mai — không đụng code
AI_PROVIDER=openrouter
AI_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=sk-or-...
```

**Model cùng provider** — chỉ đổi `AI_MODEL` (hoặc `<PROVIDER>_MODEL` để đặt
riêng, `<PROVIDER>_MODEL` thắng `AI_MODEL`).

**Key** — `AI_API_KEY` áp cho provider đang active (tiện khi đổi nhanh), hoặc
đặt `<PROVIDER>_API_KEY` cố định cho từng provider (fallback chain dùng được
luôn). `AI_API_KEY` thắng `<PROVIDER>_API_KEY`.

**Không set `AI_PROVIDER`?** Registry tự dò theo key có sẵn (thứ tự: deepseek
→ openrouter → openai → anthropic → gemini → mock).

## Fallback chain

```env
AI_PROVIDER=openrouter
AI_PROVIDER_FALLBACKS=deepseek,gemini   # thử lần lượt khi primary fail
```

Hành vi:
1. Lỗi retryable (429 rate limit / 5xx / timeout / network) → **thử lại cùng
   provider** `AI_MAX_RETRIES` (default 2) lần, backoff + jitter, tôn trọng
   `Retry-After` khi có.
2. Vẫn lỗi & lỗi "fallback-eligible" (auth sai, quá rate, model không tồn tại,
   timeout, 5xx…) → chuyển provider **kế tiếp trong chain**.
3. Hết chain → **mock chót** (degraded mode — app không chết, assistant trả
   thông điệp cấu hình) + log `ai fallback`/`ai error`.
4. Lỗi nội dung (400 bad request — prompt quá dài, schema sai) **không**
   fallback (đổi provider cũng chết nguyên lỗi) → bubble lên lỗi rõ ràng.
5. **Streaming đã emit text → không retry/fallback** (user đã thấy một nửa
   câu; re-stream sẽ lặp). Lỗi mid-stream trả error event cho client.
6. Không bao giờ infinite loop: chain phẳng, mỗi provider tối đa
   `AI_MAX_RETRIES + 1` lần thử, tổng ≤ `(retries+1) × providers`.

## Capability-aware

Mỗi (provider, model) có capability profile (`server/services/ai/capabilities.js`):

```
streaming · toolCalling · parallelToolCalls · structuredOutput · vision · reasoning
```

- Thiếu `streaming` → client tự queue non-stream, phát text thành các delta —
  frontend không thấy khác biệt.
- Thiếu `toolCalling` → tools bị bỏ khỏi request; nếu `AI_REQUIRE_TOOLS=false`
  thì assistant chạy text-only; mặc định (true) thì lỗi rõ ràng chỉ cách đổi.
- Thiếu `parallelToolCalls` → runtime tuần tự hoá tool calls (đúng semantics,
  chậm hơn chút).
- Override theo model: `AI_MODEL_CAPABILITIES` (JSON, match theo substring):

```env
AI_MODEL_CAPABILITIES={"deepseek-chat":{"parallelToolCalls":false},"o1":{"toolCalling":false}}
```

Đã biết sẵn: `deepseek-reasoner` (không tool calling), `o1-mini` (không tool
calling), `o3-mini` (không parallel calls).

## Thêm provider mới

1. **OpenAI-compatible** (phổ biến nhất): KHÔNG cần code —

```env
AI_PROVIDER=custom:fireworks
AI_CUSTOM_FIREWORKS_BASE_URL=https://api.fireworks.ai
AI_CUSTOM_FIREWORKS_API_KEY=...
AI_MODEL=accounts/fireworks/models/llama-v3p1-8b-instruct
```

2. **Wire format mới** (không OpenAI-compat): tạo
   `server/services/ai/providers/<tên>.js` implement `AIProvider`:

```js
{ id, displayName, capabilities(): {...}, generate(req), stream(req), info(): {configured, model, baseUrl} }
```

   Request vào là chuẩn nội bộ (Anthropic blocks — xem `types.js`); convert
   helpers có sẵn trong `convert.js`. Sau đó đăng ký 1 dòng trong
   `registry.js` (`REGISTER.set('<id>', adapter)`). Xong — assistant, merchant
   chat, gateway đều dùng được ngay.

## Thêm commerce tool mới

Tool registry đơn nguồn là `server/routes/agentTools.js` (mảng `TOOLS` — đã
serve discovery + HTTP invoke + manifest). Assistant tự thấy tool mới:

1. Thêm 1 object `{name, description, readOnly, rateLimit, inputSchema, handler}` vào `TOOLS`.
2. Nếu tool dành cho assistant public → thêm tên vào `PUBLIC_ALLOWED` trong
   `server/services/agent/tools.js` (chính sách: chỉ readOnly + add_to_cart).

Không cần đổi prompt, runtime, provider, hay UI.

## Kiểm tra nhanh cấu hình

```bash
# cấu hình đã resolve (không lộ key)
curl -s localhost:3000/api/v1/internal/llm/info   # cần INTERNAL_LLM_SECRET nếu bật
# hoặc
curl -s localhost:3000/api/v1/assistant/config    # public, chỉ nói live/demo
```

## Internal LLM Gateway (cho Python blueprint / agent ngoài)

`POST /api/v1/internal/llm/messages` — Anthropic Messages wire format (vào
lẫn SSE ra). Muốn bridge Python (commerce-agents blueprint) chạy với provider
bất kỳ:

```env
# server/.env
INTERNAL_LLM_SECRET=<random>
# agents/.env
KINETIC_LLM_BASE_URL=http://127.0.0.1:3000/api/v1/internal/llm
KINETIC_LLM_API_KEY=<cùng INTERNAL_LLM_SECRET>
```

Bridge cũ chạy LiteLLM proxy :4000 giờ không cần nữa — Node gateway thay thế
(chuẩn Anthropic SSE đầy đủ: `message_start`, `content_block_delta`
`text_delta`/`input_json_delta`, `message_delta`, `message_stop`).

## Bảo mật

- Key chỉ sống trong `server/.env` (server-side). Frontend chỉ gọi
  `/api/v1/assistant/*` — không bao giờ thấy key/provider thật.
- `/api/v1/assistant/config` chỉ trả `live|demo` — không lộ tên provider.
- Gateway nội bộ: fail-closed khi chưa set `INTERNAL_LLM_SECRET`.
- Tool args validate bằng zod mirror (cùng schema HTTP invoke dùng) trước khi
  handler chạm DB.
- Tool result fence (cắt dài) trước khi vào model context — chống context
  blowup và giảm surface prompt-injection từ data ngoài.
- Log AI: không key, không full prompt ở INFO; DEBUG đã redact
  (`/password|secret|token|api[-_]key/` → `[redacted]`).
