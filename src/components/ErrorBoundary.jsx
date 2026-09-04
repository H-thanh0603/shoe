import { Component } from 'react'

// 1 component crash không được trắng cả trang
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-mono text-xs tracking-widest text-accent">CÓ LỖI XẢY RA</p>
        <p className="max-w-sm text-sm text-paper/60">
          Mục này đang gặp sự cố. Thử tải lại trang — giỏ hàng và đơn hàng của bạn vẫn an toàn trên server.
        </p>
        <button
          onClick={() => location.reload()}
          className="border border-accent bg-accent px-6 py-2.5 font-display text-xs font-bold tracking-widest text-ink hover:bg-transparent hover:text-accent"
        >
          TẢI LẠI TRANG
        </button>
      </main>
    )
  }
}
