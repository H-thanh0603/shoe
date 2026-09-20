// MCP adapter chuẩn (Model Context Protocol — Streamable HTTP, stateless)
// cho TOOLS registry có sẵn (agentTools.js): Claude Desktop/Inspector/AI client
// connect trực tiếp, không cần thêm framework agent nào.
// Cùng 1 nguồn tool + validation (buildZod) + rate-limit (checkToolRateLimit).
//
// Mount: POST /api/v1/mcp (1 JSON-RPC/request, không session — scale ngang an toàn).
// GET/DELETE → 405 (stateless, không giữ SSE stream).
// Policy giữ nguyên agentTools.js: tool đọc tự gọi; add_to_cart trả shareUrl để
// người dùng nhận giỏ ở web và tự checkout — KHÔNG có tool thanh toán.
// MCP = anonymous (như /tools/call public): tool cần user chỉ preview guest.
const express = require('express')
const { TOOLS, buildZod, checkToolRateLimit } = require('./agentTools.js')
const { httpError } = require('../middleware/errorHandler.js')

const router = express.Router()

const SERVER_INFO = { name: 'kinetic-shop', version: '1.0.0' }
const INSTRUCTIONS = [
  'KINETIC shoe store tools. Prices in VND, always from DB.',
  'Read-only catalog tools can be called freely.',
  'add_to_cart returns a shareUrl — the user opens it in the web app to claim',
  'the cart and check out themselves. There is NO checkout/payment tool by',
  'design (human-in-the-loop): never ask for card details, never pay for the user.',
].join(' ')

// SDK là ESM, server là CJS → dynamic import 1 lần rồi cache
let sdkPromise = null
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import('@modelcontextprotocol/sdk/server/index.js'),
      import('@modelcontextprotocol/sdk/types.js'),
      import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
    ])
  }
  return sdkPromise
}

// Lỗi tool → text envelope {success:false,...} + isError, khớp envelope shop
function errorText(e) {
  return JSON.stringify({
    success: false,
    error: {
      code: e?.code || 'INTERNAL',
      message: e?.message || 'Lỗi server',
      ...(e?.fields ? { fields: e.fields } : {}),
    },
  })
}

router.post('/', async (req, res) => {
  let transport = null
  let server = null
  try {
    const [{ Server }, { ListToolsRequestSchema, CallToolRequestSchema }, { StreamableHTTPServerTransport }] = await loadSdk()
    server = new Server(SERVER_INFO, { capabilities: { tools: {} }, instructions: INSTRUCTIONS })
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    // identity: MCP không có header X-Agent chuẩn → User-Agent + IP
    // (write tool đã trộn IP vào key nên xoay UA không né được limit)
    const ua = String(req.get('user-agent') || 'mcp-client').slice(0, 80)
    const agentId = `mcp:${ua}|${req.ip}`.slice(0, 120)

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.readOnly ? { annotations: { readOnlyHint: true } } : {}),
      })),
    }))

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params || {}
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) {
        return { content: [{ type: 'text', text: errorText(httpError(404, 'TOOL_NOT_FOUND', `Không có tool "${name}"`)) }], isError: true }
      }
      try {
        await checkToolRateLimit(tool, agentId, req.ip)
        const parsed = buildZod(tool.inputSchema).safeParse(args ?? {})
        if (!parsed.success) {
          throw Object.assign(
            httpError(400, 'INVALID_TOOL_ARGS', 'arguments không khớp inputSchema của tool'),
            { fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
          )
        }
        const result = await tool.handler(parsed.data, { agentId, req: null, sessionId: '', progress: () => {} })
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }) }] }
      } catch (e) {
        if (!e?.status || e.status >= 500) console.error('[mcp]', name, e?.code || 'INTERNAL', e?.message)
        return { content: [{ type: 'text', text: errorText(e) }], isError: true }
      }
    })

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
    res.on('close', () => { try { transport.close() } catch {} try { server.close() } catch {} })
  } catch (e) {
    // lỗi transport/protocol (không phải lỗi tool) → 500 JSON thường
    console.error('[mcp] transport', e?.message)
    if (!res.headersSent) res.status(500).json({ success: false, error: { code: 'MCP_TRANSPORT', message: 'Lỗi MCP transport' } })
    try { transport?.close() } catch {}
    try { await server?.close() } catch {}
  }
})

// Stateless: không session/SSE stream để giữ → GET/DELETE không hỗ trợ
router.all('/', (req, res) => {
  if (req.method !== 'POST') res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'MCP endpoint chỉ nhận POST JSON-RPC' } })
})

module.exports = router
