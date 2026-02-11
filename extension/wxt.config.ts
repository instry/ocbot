import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ocbot',
    description: 'AI Browser Assistant',
    action: {
      default_title: 'ocbot',
    },
    permissions: [
      'sidePanel',
      'tabs',
      'storage',
      'activeTab',
    ],
    host_permissions: [
      'https://api.openai.com/*',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
})
