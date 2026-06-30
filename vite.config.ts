import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        changeOrigin: true,
        target: 'http://localhost:2001/voltForge-app',
      },
      '/ws': {
        target: 'http://localhost:2001/voltForge-app',
        ws: true,
      },
    },
  },
})
