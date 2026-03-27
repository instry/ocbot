import { createHashRouter } from 'react-router'
import { App } from '@/app'
import { ChatRoute } from './chat-route'
import { SettingsRoute } from './settings-route'
import { ModelsRoute } from './models-route'
import { ChannelsRoute } from './channels-route'
import { SkillsRoute } from './skills-route'

/**
 * Hash router because Electron loads from file:// protocol.
 * BrowserRouter requires a server for fallback — HashRouter works out of the box.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <ChatRoute />,
      },
      {
        path: 'chat/:sessionKey?',
        element: <ChatRoute />,
      },
      {
        path: 'settings',
        element: <SettingsRoute />,
      },
      {
        path: 'models',
        element: <ModelsRoute />,
      },
      {
        path: 'channels',
        element: <ChannelsRoute />,
      },
      {
        path: 'skills',
        element: <SkillsRoute />,
      },
    ],
  },
])
