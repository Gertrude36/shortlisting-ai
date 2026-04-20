import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ✅ vite.config.js — proxy only applies in local dev (npm run dev).
//    On Vercel, VITE_API_URL environment variable is used instead.
//    Make sure VITE_API_URL is set in Vercel → Settings → Environment Variables
//    Value: https://shortlisting-ai.onrender.com

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})