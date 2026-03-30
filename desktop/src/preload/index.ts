import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload script — exposes a minimal API to the renderer (Control UI).
 * The Control UI connects to Gateway via WebSocket directly;
 * this bridge is for Electron-specific features only.
 */
contextBridge.exposeInMainWorld('ocbot', {
  platform: process.platform,
  arch: process.arch,

  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  installSkill: (slug: string, version?: string) =>
    ipcRenderer.invoke('skill:install', slug, version),
  uninstallSkill: (slug: string) =>
    ipcRenderer.invoke('skill:uninstall', slug),
  getSystemLocale: () =>
    ipcRenderer.invoke('app:getSystemLocale'),
  getGatewayConnectionInfo: () =>
    ipcRenderer.invoke('gateway:getConnectionInfo'),
  getBrowserProfiles: () =>
    ipcRenderer.invoke('browser:getProfiles'),
  getOcbotBrowserPath: () =>
    ipcRenderer.invoke('browser:getOcbotPath'),
  startup: {
    getSettings: () =>
      ipcRenderer.invoke('startup:getSettings'),
    setOpenAtLogin: (openAtLogin: boolean) =>
      ipcRenderer.invoke('startup:setOpenAtLogin', openAtLogin),
  },
  appUpdate: {
    check: () =>
      ipcRenderer.invoke('appUpdate:check'),
    download: (asset: unknown, version: string) =>
      ipcRenderer.invoke('appUpdate:download', { asset, version }),
    cancelDownload: () =>
      ipcRenderer.invoke('appUpdate:cancelDownload'),
    install: (filePath: string) =>
      ipcRenderer.invoke('appUpdate:install', filePath),
    onDownloadProgress: (handler: (progress: unknown) => void) => {
      const listener = (_event: unknown, progress: unknown) => handler(progress)
      ipcRenderer.on('appUpdate:downloadProgress', listener)
      return () => ipcRenderer.removeListener('appUpdate:downloadProgress', listener)
    },
  },
  getChannelConfig: (platform: string) =>
    ipcRenderer.invoke('channels:getConfig', platform),
  supportsChannelQrLogin: (platform: string) =>
    ipcRenderer.invoke('channels:supportsQrLogin', platform),
  startFeishuInstallQrcode: (isLark: boolean) =>
    ipcRenderer.invoke('channels:feishuInstallQrcode', isLark),
  pollFeishuInstall: (deviceCode: string) =>
    ipcRenderer.invoke('channels:feishuInstallPoll', deviceCode),
  verifyFeishuCredentials: (appId: string, appSecret: string) =>
    ipcRenderer.invoke('channels:feishuVerifyCredentials', appId, appSecret),
  saveChannelConfig: (platform: string, config: unknown) =>
    ipcRenderer.invoke('channels:saveConfig', platform, config),
  listChannelPairingRequests: (platform: string) =>
    ipcRenderer.invoke('channels:listPairingRequests', platform),
  approveChannelPairingCode: (platform: string, code: string) =>
    ipcRenderer.invoke('channels:approvePairingCode', platform, code),
  rejectChannelPairingRequest: (platform: string, code: string) =>
    ipcRenderer.invoke('channels:rejectPairingRequest', platform, code),
})
