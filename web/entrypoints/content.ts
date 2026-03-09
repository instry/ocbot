import { onMessage } from '@/lib/messaging'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[ocbot] Content script loaded')
    
    onMessage('getPageContent', () => {
      // Extract page content safely
      const text = document.body?.innerText?.slice(0, 5000) ?? ''
      return {
        url: window.location.href,
        title: document.title,
        text,
      }
    })
  },
})