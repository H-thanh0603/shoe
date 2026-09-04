import { useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const sessionId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))

export default function AdminChat() {
  const [sid] = useState(sessionId)
  const [msgs, setMsgs] = useState([
    { from: 'agent', text: 'Chào sếp. Hỏi tôi về doanh số, tồn kho, đơn pending — hoặc bảo tôi stage change (nhập kho, đổi giá, tạo coupon). Mọi ghi đều chờ sếp duyệt ở tab DUYỆT CHANGE.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef(null)

  const scrollDown = () => setTimeout(() => boxRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)

  const send = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMsgs((m) => [...m, { from: 'user', text }, { from: 'agent', text: '', tools: [], live: true }])
    setBusy(true)
    scrollDown()
    const patchLive = (fn) => setMsgs((m) => {
      const next = [...m]
      const i = next.map((x) => x.live).lastIndexOf(true)
      if (i >= 0) next[i] = { ...next[i], ...fn(next[i]) }
      return next
    })
    try {
      // SSE qua POST (EventSource không POST được) — res.body text/event-stream
      const r = await fetch('/api/v1/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sid }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => null)
        throw new Error(body?.error?.message || `HTTP ${r.status}`)
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const frames = buf.split('\n\n')
        buf = frames.pop()
        for (const f of frames) {
          const line = f.trim().replace(/^data:\s*/, '')
          if (!line) continue
          let ev
          try { ev = JSON.parse(line) } catch { continue }
          if (ev.kind === 'text') {
            const t = ev.payload
            patchLive((m) => ({ text: m.text + t }))
            scrollDown()
          } else if (ev.kind === 'tool') {
            patchLive((m) => ({ tools: [...m.tools, ev.payload] }))
          } else if (ev.kind === 'error') {
            patchLive(() => ({ text: `Lỗi: ${ev.payload}`, error: true }))
          }
        }
      }
      patchLive((m) => ({ live: false, text: m.text || '(không có trả lời)' }))
    } catch (err) {
      patchLive(() => ({ text: `Lỗi: ${err.message}`, error: true, live: false }))
    } finally {
      setBusy(false)
      scrollDown()
    }
  }

  return (
    <div className="flex flex-col border border-white/10 bg-charcoal" style={{ height: 520 }}>
      <div ref={boxRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${m.from === 'user' ? 'self-end bg-accent text-ink' : 'self-start border border-white/10 bg-ink-deep text-paper/85'}`}>
            <p className="whitespace-pre-wrap">{m.text}</p>
            {m.tools?.length > 0 && (
              <p className="mt-1 font-mono text-[10px] opacity-60">tools: {m.tools.join(', ')}</p>
            )}
          </div>
        ))}
        {busy && <p className="font-mono text-xs text-paper/40">đang suy nghĩ… (có thể tới 1–2 phút với turn nhiều tool)</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="VD: tồn kho nào dưới 3 đôi? / nhập thêm 10 đôi air-vector-01 size 42"
          className="flex-1 border border-white/15 bg-ink-deep px-3 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-accent focus:outline-none"
        />
        <button type="submit" disabled={busy || !input.trim()} className="border border-accent bg-accent px-5 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent disabled:opacity-40">
          GỬI
        </button>
      </form>
    </div>
  )
}
