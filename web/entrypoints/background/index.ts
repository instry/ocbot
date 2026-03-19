import { initFromStorage, startChannel, stopChannel, getAllStatuses } from '../../lib/channels/manager'
import { setupMarketplaceSync } from '../../lib/marketplace/api'
import type { ChannelConfig } from '../../lib/channels/types'
import { initCron, computeNextRun } from '../../lib/cron/engine'
import { getCronTasks, saveCronTask, deleteCronTask, getTaskLogs } from '../../lib/cron/storage'
import { executeCronTask } from '../../lib/cron/executor'
import { addTaskLog } from '../../lib/cron/storage'
import type { CronTask } from '../../lib/cron/types'

export default defineBackground(() => {
  // Set side panel behavior: open when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

  // Initialize channels from storage
  initFromStorage().catch(err => {
    console.error('[ocbot] Failed to init channels:', err)
  })

  // Setup marketplace periodic sync (every 5 minutes)
  setupMarketplaceSync()

  // Initialize cron
  initCron()

  // Handle messages from sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

      case 'openSidePanel': {
        const windowIdPromise = sender.tab?.windowId
          ? Promise.resolve(sender.tab.windowId)
          : chrome.windows.getLastFocused().then(w => w.id)
        windowIdPromise
          .then(windowId => chrome.sidePanel.open({ windowId }))
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      // --- Cron messages ---

      case 'getCronTasks': {
        getCronTasks()
          .then(tasks => sendResponse({ ok: true, tasks }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'saveCronTask': {
        saveCronTask(message.task as CronTask)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'deleteCronTask': {
        deleteCronTask(message.taskId as string)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'pauseCronTask': {
        getCronTasks()
          .then(async tasks => {
            const task = tasks.find(t => t.id === message.taskId)
            if (task) await saveCronTask({ ...task, status: 'paused', updatedAt: Date.now() })
            sendResponse({ ok: true })
          })
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'resumeCronTask': {
        getCronTasks()
          .then(async tasks => {
            const task = tasks.find(t => t.id === message.taskId)
            if (task) {
              const nextRun = computeNextRun({ ...task, status: 'active' })
              await saveCronTask({ ...task, status: 'active', nextRun, updatedAt: Date.now() })
            }
            sendResponse({ ok: true })
          })
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'getTaskLogs': {
        getTaskLogs(message.taskId as string | undefined)
          .then(logs => sendResponse({ ok: true, logs }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'runTaskNow': {
        getCronTasks()
          .then(async tasks => {
            const task = tasks.find(t => t.id === message.taskId)
            if (!task) { sendResponse({ ok: false, error: 'Task not found' }); return }
            const log = await executeCronTask(task)
            await addTaskLog(log)
            await saveCronTask({
              ...task,
              lastRun: Date.now(),
              lastResult: log.status === 'error' ? `Error: ${log.error}` : (log.result ?? 'Completed'),
              updatedAt: Date.now(),
            })
            sendResponse({ ok: true, log })
          })
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }
    }

    return false
  })

  console.log('[ocbot] Background service worker initialized')
})
