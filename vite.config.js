import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // proxy tới API backend (mặc định 3000 = server/config.js) — đổi khi PORT khác:
  // VITE_API_TARGET=http://localhost:3100 npm run dev
  server: { proxy: { '/api': process.env.VITE_API_TARGET || 'http://localhost:3000' } },
})
