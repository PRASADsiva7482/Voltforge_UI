import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep route chunks focused on VoltForge code while giving long-lived,
          // heavyweight dependencies stable cache ownership. The max size stays
          // below Vite's 500 kB production warning budget.
          minSize: 10_000,
          maxSize: 400_000,
          groups: [
            {
              name: 'vendor-simulation',
              test: /node_modules[\\/]avr8js[\\/]/,
              priority: 50,
            },
            {
              name: 'vendor-canvas',
              test: /node_modules[\\/](?:konva|react-konva)[\\/]/,
              priority: 45,
            },
            {
              name: 'vendor-editor',
              test: /node_modules[\\/]@monaco-editor[\\/]react[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-react',
              test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler|zustand|@tanstack[\\/]react-query)[\\/]/,
              priority: 35,
            },
            {
              name: 'vendor-icons',
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 32,
            },
            {
              name: 'vendor-platform',
              test: /node_modules[\\/](?:axios|clsx|i18next|i18next-browser-languagedetector|keycloak-js|react-i18next)[\\/]/,
              priority: 30,
            },
          ],
        },
      },
    },
  },
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
      '/api/v1/ai': {
        changeOrigin: true,
        target: 'http://localhost:2002/voltForge-ai',
        rewrite: (path) => path.replace(/^\/api\/v1\/ai/, '/api/v1/model'),
      },
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
