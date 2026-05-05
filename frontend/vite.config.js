import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * vite.config.js
 *
 * FIXES:
 * 1. Proxy target is now 'https://shortlisting-ai.onrender.com' (your actual
 *    backend) so dev requests reach the real server instead of localhost:8000.
 * 2. The /api prefix is stripped by the rewrite so the backend receives the
 *    correct path e.g. /api/auth/login → /auth/login.
 * 3. secure: false allows the proxy to forward to HTTPS targets from HTTP dev server.
 *
 * In production (Vercel), VITE_API_URL is set and the proxy is not used.
 * Make sure VITE_API_URL is set in Vercel → Settings → Environment Variables:
 *   VITE_API_URL = https://shortlisting-ai.onrender.com
 */

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:       'https://shortlisting-ai.onrender.com',
        changeOrigin: true,
        secure:       false,
        rewrite:      (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
