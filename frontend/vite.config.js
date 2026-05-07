import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true, // Auto-opens in your default browser (Chrome) on npm run dev
    // No proxy needed — axios uses VITE_API_URL directly (see .env.local)
  },
})