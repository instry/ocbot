export default defineBackground(() => {
  // Set side panel behavior: open when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  
  console.log('[ocbot] Background service worker initialized')
})