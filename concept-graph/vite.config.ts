import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
const assistantTarget = process.env.ASSISTANT_BACKEND_URL || 'http://127.0.0.1:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/copilotkit': assistantTarget,
      '/api/record': assistantTarget,
      '/api/settings': assistantTarget,
      '/health': assistantTarget,
    },
  },
})
