import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload script — exposes a minimal API to the renderer (Control UI).
 * The Control UI connects to Gateway via WebSocket directly;
 * this bridge is for Electron-specific features only.
 */
contextBridge.exposeInMainWorld('ocbot', {
  platform: process.platform,

  // Window controls (for custom title bar)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
})
