import { useEffect, useRef, useState } from 'react'

// Trợ lý mua giày KINETIC — chat floating, streaming SSE qua
// POST /api/v1/assistant/chat/stream (fetch + ReadableStream — EventSource
// không POST được; cùng pattern AdminChat).
//
// Agent chạy trên server (Node runtime + AI provider layer) — frontend
// KHÔNG biết provider/model nào đang phía sau. Tool chips hiển thị tool
// đang chạy; add_to_cart trả shareUrl → nút "Nhận giỏ" đưa người dùng vào
// luồng checkout tự bấm (human-in-the-loop).

const sessionId = () => (crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}`)

const QUICK = [
  'Giày chạy bộ dưới 2 triệu?',
  'So sánh air-vector-01 và pulse-dash-02',
  'Gợi ý giày đi học mỗi ngày',
]

export default function ShoppingAssistant() {
  const [open, setOpen] = useState(false)
  const [sid] = useState(sessionId)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState(null) // {prefs, budget} — panel 🧠
  const [showProfile, setShowProfile] = useState(false)
  const boxRef = useRef(null)

  const scrollDown = () => setTimeout(() => boxRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 60)

  useEffect(() => { if (open) scrollDown() }, [open, msgs.length])

  // journey slices: giỏ/product/track mở chat với câu hỏi có sẵn
  useEffect(() => {
    const fn = (e) => {
      const q = String(e.detail || '').slice(0, 300)
      if (!q) return
      setOpen(true)
      setTimeout(() => send(null, q), 100)
    }
    window.addEventListener('assistant-ask', fn)
    return () => window.removeEventListener('assistant-ask', fn)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const patchLive = (fn) => setMsgs((m) => {
    const next = [...m]
    const i = next.map((x) => x.live).lastIndexOf(true)
    if (i >= 0) next[i] = { ...next[i], ...fn(next[i]) }
    return next
  })

  const send = async (e, preset) => {
    e?.preventDefault?.()
    const text = (preset || input).trim()
    if (!text || busy) return
    setInput('')
    setMsgs((m) => [...m, { from: 'user', text }, { from: 'agent', text: '', tools: [], live: true }])
    setBusy(true)
    scrollDown()
    try {
      const r = await fetch('/api/v1/assistant/chat/stream', {
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
            patchLive((m) => ({ text: m.text + ev.payload }))
            scrollDown()
          } else if (ev.kind === 'tool') {
            patchLive((m) => ({ tools: [...m.tools, ev.payload] }))
          } else if (ev.kind === 'tool_result') {
            // lọc shareUrl từ add_to_cart/claim_and_attach_cart để render nút nhận giỏ
            if ((ev.payload?.tool === 'add_to_cart' || ev.payload?.tool === 'claim_and_attach_cart') && ev.payload?.status === 'ok') {
              patchLive((m) => ({ cartAdded: true }))
            }
          } else if (ev.kind === 'plan') {
            // explicit planning — task state thật: các bước model tự viết
            patchLive((m) => ({ plan: ev.payload.steps }))
          } else if (ev.kind === 'step_done') {
            patchLive((m) => ({ planDone: [...(m.planDone || []), ev.payload.label] }))
          } else if (ev.kind === 'error') {
            patchLive(() => ({ text: `Lỗi: ${ev.payload?.message || 'không rõ'}`, error: true }))
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

  // extract shareUrl từ text agent (add_to_cart trả link /gio-hang/...)
  const cartUrl = (text) => {
    const m = /\/gio-hang\/[a-z0-9-]+/i.exec(text || '')
    return m ? m[0] : null
  }

  return (
    <>
      {/* Floating button — luôn hiện, trừ khi đang mở panel */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Trợ lý mua giày"
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-accent/60 bg-charcoal text-accent shadow-lg transition-all hover:bg-accent hover:text-ink focus-visible:outline focus-visible:outline-accent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6a8.5 8.5 0 1 1 16.1-3.9z" />
          </svg>
        </button>
      )}

      {open && (
        <section
          aria-label="Trợ lý mua giày KINETIC"
          className="fixed bottom-4 right-4 z-40 flex h-[70vh] max-h-[560px] w-[calc(100vw-2rem)] max-w-[380px] flex-col border border-white/10 bg-charcoal backdrop-blur-sm"
        >
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="font-display text-xs font-bold tracking-widest text-paper">TRỢ LÝ MUA GIÀY</p>
              <p className="text-[10px] text-paper/50">Tìm · so sánh · gợi ý · thêm giỏ giúp bạn</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!showProfile) {
                    try {
                      const r = await fetch(`/api/v1/assistant/profile?sessionId=${encodeURIComponent(sid)}`)
                      const j = await r.json()
                      if (j.success) setProfile(j.data)
                    } catch { /* panel mở rỗng */ }
                  }
                  setShowProfile((v) => !v)
                }}
                aria-label="Sở thích đã nhớ"
                title="Shop nhớ gì về bạn"
                className="border border-white/15 px-2 py-1 font-mono text-[10px] text-paper/60 transition-colors hover:border-accent hover:text-accent"
              >
                🧠 {profile?.prefs?.length ? profile.prefs.length : ''}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Đóng" className="text-paper/60 transition-colors hover:text-accent focus-visible:text-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </header>

          {showProfile && (
            <div className="border-b border-white/10 bg-ink-deep px-4 py-3 text-xs">
              <p className="font-mono text-[10px] tracking-widest text-paper/50">SHOP NHỚ VỀ BẠN</p>
              {profile?.prefs?.length ? (
                <ul className="mt-2 space-y-1">
                  {profile.prefs.map((p) => (
                    <li key={p.key} className="text-paper/80">✓ {p.label || p.key}: <span className="text-accent">{p.value}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-paper/50">Chưa nhớ gì — nói "tôi thích Nike, đi size 42" là shop nhớ.</p>
              )}
              {profile?.budget && (
                <p className="mt-1 text-paper/60">Ngân sách phiên: {profile.budget.spent.toLocaleString('vi-VN')}₫ / {profile.budget.total.toLocaleString('vi-VN')}₫</p>
              )}
              <button
                onClick={async () => {
                  await fetch('/api/v1/assistant/profile', { method: 'DELETE' }).catch(() => {})
                  setProfile({ prefs: [], budget: null })
                }}
                className="mt-2 border border-white/15 px-2 py-1 font-mono text-[10px] text-paper/60 hover:border-accent hover:text-accent"
              >
                QUÊN HẾT
              </button>
            </div>
          )}

          <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <div className="border border-white/10 bg-ink-deep px-3 py-2.5 text-sm text-paper/85">
                  Chào bạn — tôi tìm giày theo nhu cầu, so sánh, kiểm size còn hàng và thêm giỏ giúp. Bạn đang cần giày để làm gì?
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button key={q} onClick={(e) => send(e, q)} disabled={busy}
                      className="border border-white/15 px-2.5 py-1.5 text-left text-xs text-paper/70 transition-colors hover:border-accent hover:text-accent disabled:opacity-40">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => {
              const shareUrl = m.from === 'agent' ? cartUrl(m.text) : null
              const isPlanStepDone = (m, step, idx) => (m.planDone || []).some((d) => d.startsWith(`B${idx + 1}`))
              return (
                <div key={i} className={`max-w-[92%] px-3 py-2 text-sm leading-relaxed ${m.from === 'user' ? 'self-end ml-auto bg-accent text-ink' : 'border border-white/10 bg-ink-deep text-paper/85'}`}>
                  {m.plan?.length > 0 && (
                    <ol className="mb-2 space-y-1 border-l border-accent/40 pl-3">
                      {m.plan.map((step, j) => {
                        const done = isPlanStepDone(m, step, j)
                        return (
                          <li key={j} className={`flex items-start gap-1.5 text-[11px] ${done ? 'text-paper/40 line-through' : busy && m.live ? 'text-paper/80' : 'text-paper/60'}`}>
                            <span className={done ? 'text-accent' : 'text-paper/30'} aria-hidden="true">{done ? '✓' : '○'}</span>
                            <span>{step}</span>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.text || (m.live && !m.plan?.length ? '…' : '')}</p>
                  {m.tools?.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {m.tools.map((t, j) => (
                        <span key={j} className="border border-white/15 px-1.5 py-0.5 font-mono text-[9px] text-paper/50">{t.label || t.name || t}</span>
                      ))}
                    </p>
                  )}
                  {shareUrl && (
                    <a href={shareUrl} className="mt-2 inline-block border border-accent bg-accent px-3 py-1.5 font-display text-[10px] font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent">
                      NHẬN GIỎ &amp; THANH TOÁN →
                    </a>
                  )}
                </div>
              )
            })}
            {busy && !msgs[msgs.length - 1]?.text && (
              <p className="font-mono text-[10px] text-paper/40">đang tìm thông tin…</p>
            )}
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="VD: giày chạy bộ dưới 2 triệu size 42"
              className="flex-1 border border-white/15 bg-ink-deep px-3 py-2.5 text-sm text-paper placeholder:text-paper/50 focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="border border-accent bg-accent px-4 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent disabled:opacity-40">
              GỬI
            </button>
          </form>
        </section>
      )}
    </>
  )
}
