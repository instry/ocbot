import { defineExtensionMessaging } from '@webext-core/messaging'

interface PageContent {
  url: string
  title: string
  text: string
}

interface MessagingProtocol {
  getPageContent(): PageContent
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<MessagingProtocol>()

export type { PageContent }
