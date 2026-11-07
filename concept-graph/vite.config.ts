import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/copilotkit': 'http://127.0.0.1:4000',
      '/health': 'http://127.0.0.1:4000',
    },
  },
})
