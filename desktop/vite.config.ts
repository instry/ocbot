import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    __OCBOT_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/renderer/index.html',
    },
  },
  publicDir: '../../resources/icons',
})
