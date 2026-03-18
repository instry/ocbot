import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/postcss'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjyF4io3NWj9xRXAkbp2QBis6A//utwRT/qQXsKKwrr4SdB61im3hdCpT2n7gh2Hx0Fbwdjeax+qWaxfuxU87uo69flseM7PXjTBGhxKa/e0YF3It+YM8YHkSDut6wO5CpFTXa2BSI0nnvvSxwJSpjw+n1WiLZINzYzWhiCLuxHxb1tPXahjMovmeDJykfZXZrMbLSZAizLpUMq4a2fzYpLxH67O+QSgApSXAq/TcuSxb22cYfKrqUNToz/DtmuhDLEHy2uuxuItJAIFUYB+68UFQ4Irs3lur2KbGFfKQNJW4F3pCEs9OckKlk64zKZDRnIl4xMaVcLXg2r3XvFQxkwIDAQAB",
    name: 'ocbot - AI Browser Assistant',
    description: 'Your personal AI assistant integrated into the browser',
    version: '26.3.18',
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
      'activeTab',
      'scripting',
      'debugger',
      'identity',
      'alarms'
    ],
    host_permissions: [
      '<all_urls>',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.deepseek.com/*',
      'https://dashscope.aliyuncs.com/*',
      'https://api.moonshot.ai/*',
      'https://api.moonshot.cn/*',
      'https://api.z.ai/*',
      'https://api.minimax.io/*',
      'https://openrouter.ai/*'
    ],
    side_panel: {
      default_path: 'sidepanel.html'
    }
  },
  vite: () => ({
    define: {
      __OCBOT_SUPABASE_URL__: JSON.stringify(process.env.OCBOT_SUPABASE_URL || ''),
      __OCBOT_SUPABASE_ANON_KEY__: JSON.stringify(process.env.OCBOT_SUPABASE_ANON_KEY || ''),
      __OCBOT_API_URL__: JSON.stringify(process.env.OCBOT_API_URL || 'http://localhost:8080'),
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), require('autoprefixer')]
      }
    }
  })
})