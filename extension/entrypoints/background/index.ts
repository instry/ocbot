import { initFromStorage, startChannel, stopChannel, getAllStatuses } from '../../lib/channels/manager'
import type { ChannelConfig } from '../../lib/channels/types'

export default defineBackground(() => {
  // Set side panel behavior: open when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

  // Initialize channels from storage
  initFromStorage().catch(err => {
    console.error('[ocbot] Failed to init channels:', err)
  })

  // Handle messages from sidepanel
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false

    switch (message.type) {
      case 'startChannel': {
        const config = message.config as ChannelConfig
        startChannel(config)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true // async response
      }

      case 'stopChannel': {
        stopChannel(message.channelId as string)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'getChannelStatuses': {
        sendResponse({ ok: true, statuses: getAllStatuses() })
        return false
      }
    }

    return false
  })

  console.log('[ocbot] Background service worker initialized')
})
