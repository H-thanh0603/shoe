import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // three.js nặng (~600KB) — gom 1 chunk vendor riêng để ShoeViewer3D + TryOnAR
    // dùng chung (không duplicate), browser cache 1 lần.
    rollupOptions: { output: { manualChunks: { 'vendor-three': ['three'] } } },
  },
  // proxy tới API backend (mặc định 3000 = server/config.js) — đổi khi PORT khác:
  // VITE_API_TARGET=http://localhost:3100 npm run dev
  server: { proxy: {
    '/api': process.env.VITE_API_TARGET || 'http://localhost:3000',
    '/uploads': process.env.VITE_API_TARGET || 'http://localhost:3000', // ảnh sản phẩm do admin upload
  } },
})
