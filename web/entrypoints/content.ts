import { Readability } from '@mozilla/readability'
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

    onMessage('getArticleContent', () => {
      const url = window.location.href
      const title = document.title

      try {
        const clone = document.cloneNode(true) as Document
        const article = new Readability(clone).parse()
        if (article) {
          return {
            url,
            title: article.title || title,
            byline: article.byline,
            content: article.textContent?.slice(0, 50000) ?? '',
            length: article.textContent?.length ?? 0,
          }
        }
      } catch {
        // Readability failed, fall through to fallback
      }

      // Fallback: raw innerText
      const text = document.body?.innerText?.slice(0, 50000) ?? ''
      return {
        url,
        title,
        byline: null,
        content: text,
        length: text.length,
      }
    })
  },
})
