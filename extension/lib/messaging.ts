import { defineExtensionMessaging } from '@webext-core/messaging'

// Page content extracted from content script
export interface PageContent {
  url: string
  title: string
  text: string
}

// Messaging protocol between sidepanel and content script
interface Protocol {
  // Get page content from current tab
  getPageContent(): PageContent
}

export const { sendMessage, onMessage } = defineExtensionMessaging<Protocol>()

export type { PageContent }