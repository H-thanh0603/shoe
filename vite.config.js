import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ponytail: proxy dev tới 3100 vì 3000 bị project khác chiếm — prod serve static từ Express
  server: { proxy: { '/api': 'http://localhost:3100' } },
})
