import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/postcss'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjyF4io3NWj9xRXAkbp2QBis6A//utwRT/qQXsKKwrr4SdB61im3hdCpT2n7gh2Hx0Fbwdjeax+qWaxfuxU87uo69flseM7PXjTBGhxKa/e0YF3It+YM8YHkSDut6wO5CpFTXa2BSI0nnvvSxwJSpjw+n1WiLZINzYzWhiCLuxHxb1tPXahjMovmeDJykfZXZrMbLSZAizLpUMq4a2fzYpLxH67O+QSgApSXAq/TcuSxb22cYfKrqUNToz/DtmuhDLEHy2uuxuItJAIFUYB+68UFQ4Irs3lur2KbGFfKQNJW4F3pCEs9OckKlk64zKZDRnIl4xMaVcLXg2r3XvFQxkwIDAQAB",
    name: 'ocbot - AI Browser Assistant',
    description: 'Your personal AI assistant integrated into the browser',
    version: '0.2.0',
    action: {
      default_title: 'ocbot',
      default_icon: {
        '16': 'icon/icon16.png',
        '32': 'icon/icon32.png',
        '48': 'icon/icon48.png',
        '128': 'icon/icon128.png'
      }
    },
    icons: {
      '16': 'icon/icon16.png',
      '32': 'icon/icon32.png',
      '48': 'icon/icon48.png',
      '128': 'icon/icon128.png'
    },
    permissions: [
      'sidePanel',
      'tabs',
      'storage',
      'activeTab'
    ],
    host_permissions: [
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*'
    ],
    side_panel: {
      default_path: 'sidepanel.html'
    }
  },
  vite: () => ({
    css: {
      postcss: {
        plugins: [tailwindcss(), require('autoprefixer')]
      }
    }
  })
})