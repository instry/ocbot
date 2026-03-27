import { defineExtensionMessaging } from '@webext-core/messaging'

// Page content extracted from content script
export interface PageContent {
  url: string
  title: string
  text: string
}

// Article content extracted via Readability.js
export interface ArticleContent {
  url: string
  title: string
  byline: string | null
  content: string  // text content (no HTML)
  length: number
}

// Messaging protocol between sidepanel and content script
interface Protocol {
  // Get page content from current tab
  getPageContent(): PageContent
  // Get clean article content using Readability.js
  getArticleContent(): ArticleContent
}

export const { sendMessage, onMessage } = defineExtensionMessaging<Protocol>()
