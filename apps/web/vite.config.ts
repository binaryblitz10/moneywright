import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import pkg from './package.json'

// Dev API port: PORT lets a dev server run next to the desktop app, which owns 17777
const apiTarget = `http://localhost:${process.env.PORT ?? 17777}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [TanStackRouterVite({ quoteStyle: 'single' }), react(), tailwindcss(), tsconfigPaths()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
