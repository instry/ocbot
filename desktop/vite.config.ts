import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/renderer',
  define: {
    __OCBOT_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
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
