export default defineBackground(() => {
  // Set side panel behavior: open when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

  // Handle messages from UI
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return false

    if (message.type === 'openSidePanel') {
      const windowIdPromise = sender.tab?.windowId
        ? Promise.resolve(sender.tab.windowId)
        : chrome.windows.getLastFocused().then(w => w.id)
      windowIdPromise
        .then(windowId => chrome.sidePanel.open({ windowId }))
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err) }))
      return true
    }

    return false
  })

  console.log('[ocbot] Background service worker initialized')
})
