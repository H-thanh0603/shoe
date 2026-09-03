import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiGet } from '../lib/api.js'
import { playTechClick } from '../lib/sound.js'

const MAX_FILES = 3
const MAX_FILE_BYTES = 1024 * 1024 // 1MB/ảnh phía client (server cho ~500KB)

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = reject
  r.readAsDataURL(file)
})

export default function Reviews({ slug }) {
  const [data, setData] = useState(null)
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(() => {
    apiGet(`/products/${slug}/reviews`).then(setData).catch(() => {})
  }, [slug])
  useEffect(load, [load])

  const onFiles = async (e) => {
    const files = [...e.target.files].slice(0, MAX_FILES - images.length)
    const urls = []
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        setMsg('Chỉ nhận ảnh JPG/PNG/WebP.')
        continue
      }
      if (f.size > MAX_FILE_BYTES) {
        setMsg(`Ảnh ${f.name} quá 1MB — chọn ảnh nhỏ hơn.`)
        continue
      }
      urls.push(await readAsDataURL(f))
    }
    setImages((prev) => [...prev, ...urls].slice(0, MAX_FILES))
    e.target.value = ''
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      await apiFetch(`/products/${slug}/reviews`, {
        method: 'POST',
        body: { rating, content: content || undefined, images: images.length ? images : undefined },
      })
      setContent(''); setImages([]); setRating(5)
      setMsg('✓ ĐÃ GỬI ĐÁNH GIÁ.')
      playTechClick()
      load()
    } catch (err) {
      setMsg(err.status === 401 ? 'Đăng nhập để gửi đánh giá.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const helpful = async (id) => {
    try {
      const { helpfulCount, voted } = await apiFetch(`/products/${slug}/reviews/${id}/helpful`, { method: 'POST' })
      setData((d) => d && {
        ...d,
        items: d.items.map((r) => r.id === id ? { ...r, helpful_count: helpfulCount, voted } : r),
      })
    } catch (err) {
      if (err.status === 401) setMsg('Đăng nhập để vote đánh giá hữu ích.')
    }
  }

  const items = data?.items || []

  return (
    <section className="mt-20 border-t border-white/10 pt-12">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-display text-xl font-bold text-paper">
          ĐÁNH GIÁ TỪ CỘNG ĐỒNG ({data?.count || 0})
        </h3>
        {data?.count > 0 && (
          <span className="font-mono text-xs text-accent font-bold">
            ★ {data.avgRating} / 5.0
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.slice(0, 4).map((r) => (
          <div key={r.id} className="border border-white/10 bg-charcoal p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-paper">{r.user_name || 'Khách hàng'}</span>
                <span className="text-accent">{'★'.repeat(r.rating || 5)}</span>
              </div>
              <p className="mt-3 text-sm text-paper/70 font-sans leading-relaxed">
                &quot;{r.content}&quot;
              </p>
              {r.images?.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {r.images.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer">
                      <img src={src} alt={`Ảnh đánh giá ${i + 1}`} className="h-16 w-16 border border-white/15 object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between font-mono text-[10px] text-paper/40 pt-3 border-t border-white/5">
              <span className="flex items-center gap-2">
                {r.verified && <span className="text-accent font-semibold">✓ ĐÃ MUA HÀNG</span>}
                <button
                  onClick={() => helpful(r.id)}
                  className={`border px-2 py-0.5 transition-colors ${r.voted ? 'border-accent bg-accent text-ink font-bold' : 'border-white/15 hover:border-accent hover:text-accent'}`}
                >
                  HỮU ÍCH ({r.helpful_count || 0})
                </button>
              </span>
              <span>{new Date(r.created_at).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Form gửi đánh giá */}
      <form onSubmit={submit} className="mt-8 border border-white/10 bg-charcoal-2/40 p-5">
        <p className="font-mono text-xs font-semibold tracking-widest text-paper/80">VIẾT ĐÁNH GIÁ CỦA BẠN</p>
        <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Số sao">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setRating(s); playTechClick() }}
              aria-label={`${s} sao`}
              className={`text-2xl transition-transform hover:scale-110 ${s <= rating ? 'text-accent' : 'text-paper/25'}`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Cảm nhận về fit, êm, chất liệu… (tùy chọn)"
          className="mt-3 w-full border border-white/15 bg-ink-deep px-3 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer border border-white/15 px-3 py-1.5 font-mono text-xs text-paper/70 hover:border-accent hover:text-accent">
            + THÊM ẢNH ({images.length}/{MAX_FILES})
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
          </label>
          {images.map((src, i) => (
            <span key={i} className="relative">
              <img src={src} alt={`Ảnh đính kèm ${i + 1}`} className="h-14 w-14 border border-white/15 object-cover" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Xóa ảnh"
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-bold text-ink"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        {msg && <p className="mt-3 font-mono text-xs text-accent" role="status">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 border border-accent bg-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent disabled:opacity-50"
        >
          {busy ? 'ĐANG GỬI…' : 'GỬI ĐÁNH GIÁ'}
        </button>
      </form>
    </section>
  )
}
