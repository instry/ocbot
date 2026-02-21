import { ChatArea } from './components/ChatArea'
import { ChatInput } from './components/ChatInput'

export function App() {
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <ChatArea />
      <ChatInput />
    </div>
  )
}