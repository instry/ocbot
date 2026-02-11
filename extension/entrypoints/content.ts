import { onMessage } from '@/lib/messaging'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    onMessage('getPageContent', () => {
      const text = document.body.innerText?.slice(0, 5000) ?? ''
      return {
        url: window.location.href,
        title: document.title,
        text,
      }
    })
  },
})
