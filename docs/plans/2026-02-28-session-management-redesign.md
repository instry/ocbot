# Session Management Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign sidepanel session management so it always opens fresh, with history accessible via a ☰ button that full-screen switches to a simplified history list.

**Architecture:** Remove auto-restore-last-conversation behavior from `useChat`. Redesign `Header` with two modes (chat vs history). Simplify `ChatList` by removing pin/rename. Unify header rendering so it's always at the top in `App.tsx`.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons, chrome.storage.local

---

### Task 1: Remove `pinned` from Conversation type

**Files:**
- Modify: `ocbot_agent/lib/types.ts:29`

**Step 1: Remove pinned field**

In `lib/types.ts`, remove line 29 (`pinned?: boolean`) from the `Conversation` interface.

The interface should become:
```ts
export interface Conversation {
  id: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  title?: string
}
```

**Step 2: Build to check for type errors**

Run: `cd ocbot_agent && npm run build 2>&1 | head -30`
Expected: Type errors in files that reference `pinned` — that's fine, we'll fix them in subsequent tasks.

---

### Task 2: Simplify `useChat` hook

**Files:**
- Modify: `ocbot_agent/lib/hooks/useChat.ts`

**Step 1: Change mount behavior — don't restore last conversation**

Replace the mount effect (lines 45-55) with:
```ts
useEffect(() => {
  getConversations().then(convs => {
    setConversations(convs)
  })
}, [])
```

**Step 2: Remove `updateConversation`**

Delete the entire `updateConversation` callback (lines 83-94).

**Step 3: Remove `pinned` references in `convMetaRef`**

In `convMetaRef` (line 36), change type to `{ title?: string }` and remove all `pinned` references:
- Line 36: `const convMetaRef = useRef<{ title?: string }>({})`
- `loadConversation`: change `convMetaRef.current = { title: conv.title, pinned: conv.pinned }` → `convMetaRef.current = { title: conv.title }`
- `removeConversation`: change `convMetaRef.current = { title: next.title, pinned: next.pinned }` → `convMetaRef.current = { title: next.title }`
- Auto-save effect: remove `pinned: convMetaRef.current.pinned` from the `conv` object

**Step 4: Remove `updateConversation` from return**

Remove `updateConversation` from the return object.

**Step 5: Build**

Run: `cd ocbot_agent && npm run build 2>&1 | head -30`
Expected: Errors in files that call `updateConversation` — fixed in next tasks.

---

### Task 3: Simplify `ChatList` component

**Files:**
- Modify: `ocbot_agent/components/ChatList.tsx`

**Step 1: Simplify props**

Replace the props interface with:
```ts
interface ChatListProps {
  conversations: Conversation[]
  activeConversationId: string
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
}
```

**Step 2: Rewrite `ChatItem`**

Replace the entire `ChatItem` component with a simplified version — no menu, no rename, no pin. Just a hover-visible delete button:

```tsx
function ChatItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const title = conv.title || 'New Chat'

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/80 ${
        isActive ? 'bg-accent/50' : ''
      }`}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <span className="text-xs text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

**Step 3: Simplify `ChatList` export**

Remove `onPinChat`, `onRenameChat`, `onClose` props. Remove "Pinned" section. Remove the header (parent will handle it):

```tsx
export function ChatList({
  conversations,
  activeConversationId,
  onSelectChat,
  onDeleteChat,
}: ChatListProps) {
  const { today, yesterday, earlier } = groupConversations(conversations)

  const renderSection = (label: string, items: Conversation[]) => {
    if (items.length === 0) return null
    return (
      <div className="mb-2">
        <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {items.map(conv => (
          <ChatItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeConversationId}
            onSelect={() => onSelectChat(conv.id)}
            onDelete={() => onDeleteChat(conv.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-1">
      {conversations.length > 0 ? (
        <>
          {renderSection('Today', today)}
          {renderSection('Yesterday', yesterday)}
          {renderSection('Earlier', earlier)}
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No conversations yet
        </div>
      )}
    </div>
  )
}
```

**Step 4: Clean up imports**

Remove unused imports: `useState`, `useRef`, `useEffect`, `MoreHorizontal`, `Pin`, `PinOff`, `Pencil`, `ArrowLeft`. Keep: `Trash2` from lucide-react, `Conversation` type.

**Step 5: Update `groupConversations`**

Remove the `pinned` group from `groupConversations`:
```ts
function groupConversations(conversations: Conversation[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000

  const today: Conversation[] = []
  const yesterday: Conversation[] = []
  const earlier: Conversation[] = []

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  for (const conv of sorted) {
    if (conv.updatedAt >= todayStart) {
      today.push(conv)
    } else if (conv.updatedAt >= yesterdayStart) {
      yesterday.push(conv)
    } else {
      earlier.push(conv)
    }
  }

  return { today, yesterday, earlier }
}
```

---

### Task 4: Redesign `Header` with two modes

**Files:**
- Modify: `ocbot_agent/entrypoints/sidepanel/components/Header.tsx`

**Step 1: Update props and rewrite**

Replace the entire file with:

```tsx
import { Settings, Menu, ArrowLeft, SquarePen } from 'lucide-react'
import type { ChannelStatus } from '@/lib/channels/types'
import { BotAvatar } from '@/components/BotAvatar'

interface HeaderProps {
  view: 'chat' | 'history'
  onOpenSettings: () => void
  onNewChat: () => void
  onToggleHistory: () => void
  channelStatuses: Record<string, ChannelStatus>
}

export function Header({ view, onOpenSettings, onNewChat, onToggleHistory, channelStatuses }: HeaderProps) {
  const statusValues = Object.values(channelStatuses)
  const aggregateChannelStatus: ChannelStatus | null =
    statusValues.length === 0 ? null
    : statusValues.includes('error') ? 'error'
    : statusValues.includes('connecting') ? 'connecting'
    : statusValues.includes('connected') ? 'connected'
    : null

  const statusDotColor = aggregateChannelStatus === 'connected' ? 'bg-green-500'
    : aggregateChannelStatus === 'connecting' ? 'bg-yellow-500'
    : aggregateChannelStatus === 'error' ? 'bg-red-500'
    : null

  if (view === 'history') {
    return (
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleHistory}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">History</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNewChat}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title="New Chat"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title="Settings"
          >
            <div className="relative">
              <Settings className="h-4 w-4" />
              {statusDotColor && (
                <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-background ${statusDotColor}`} />
              )}
            </div>
          </button>
        </div>
      </header>
    )
  }

  return (
    <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <BotAvatar size="sm" />
        <span className="text-sm font-semibold">ocbot</span>
      </div>
      <button
        onClick={onToggleHistory}
        className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        title="History"
      >
        <Menu className="h-4 w-4" />
      </button>
    </header>
  )
}
```

---

### Task 5: Update `sidepanel/App.tsx`

**Files:**
- Modify: `ocbot_agent/entrypoints/sidepanel/App.tsx`

**Step 1: Update to unified header layout**

Replace the return JSX with:

```tsx
return (
  <div className="flex h-screen w-screen flex-col bg-background text-foreground">
    {view !== 'settings' && (
      <Header
        view={view === 'chatList' ? 'history' : 'chat'}
        onOpenSettings={() => setView('settings')}
        onNewChat={() => { newChat(); setView('chat') }}
        onToggleHistory={() => setView(v => v === 'chatList' ? 'chat' : 'chatList')}
        channelStatuses={channelStatuses}
      />
    )}
    {view === 'chat' && (
      <>
        <ChatArea
          hasProvider={!!selectedProvider}
          onOpenSettings={() => setView('settings')}
          messages={messages}
          streamingText={streamingText}
          isLoading={isLoading}
          toolStatuses={toolStatuses}
          error={error}
        />
        <ChatInput
          onSend={sendMessage}
          onStop={stopAgent}
          isLoading={isLoading}
          disabled={!selectedProvider}
          providers={providers}
          selectedProvider={selectedProvider}
          onSelectProvider={selectProvider}
          onConfigureLlm={() => setView('settings')}
        />
      </>
    )}
    {view === 'chatList' && (
      <ChatList
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectChat={handleSelectChat}
        onDeleteChat={removeConversation}
      />
    )}
    {view === 'settings' && (
      <Settings
        providers={providers}
        selectedProvider={selectedProvider}
        onSaveProvider={saveProvider}
        onDeleteProvider={deleteProvider}
        onSelectProvider={selectProvider}
        onBack={() => setView('chat')}
      />
    )}
  </div>
)
```

**Step 2: Remove `updateConversation` from useChat destructuring**

Change line 19 from:
```ts
loadConversation, updateConversation, removeConversation,
```
to:
```ts
loadConversation, removeConversation,
```

**Step 3: Fix `setView` for toggle**

The `View` type is already `'chat' | 'chatList' | 'settings'` — no change needed. But `setView(v => ...)` needs the functional form. Change the state setter type if needed. Actually `useState<View>` already supports functional updates, so just make sure the toggle callback works:

```ts
onToggleHistory={() => setView(v => v === 'chatList' ? 'chat' : 'chatList')}
```

---

### Task 6: Update `home/pages/ChatPage.tsx`

**Files:**
- Modify: `ocbot_agent/entrypoints/home/pages/ChatPage.tsx`

**Step 1: Remove `updateConversation` and simplify `ChatList` usage**

Change the useChat destructuring (line 14) to remove `updateConversation`.

Update `ChatList` usage (lines 20-29) to remove `onPinChat`, `onRenameChat`, and `onClose`:

```tsx
if (showChatList) {
  return (
    <ChatList
      conversations={conversations}
      activeConversationId={conversationId}
      onSelectChat={(id) => { loadConversation(id); setShowChatList(false) }}
      onDeleteChat={removeConversation}
    />
  )
}
```

---

### Task 7: Build and verify

**Step 1: Build**

Run: `cd ocbot_agent && npm run build 2>&1`
Expected: Clean build with no errors.

**Step 2: Fix any remaining type errors**

If build fails, fix the reported errors — likely stale references to `pinned` or `updateConversation`.

---

## File Summary

| File | Action |
|------|--------|
| `lib/types.ts` | Remove `pinned` from Conversation |
| `lib/hooks/useChat.ts` | Remove auto-restore, remove `updateConversation`, remove `pinned` refs |
| `components/ChatList.tsx` | Simplify: remove pin/rename/header, hover delete only |
| `entrypoints/sidepanel/components/Header.tsx` | Redesign: two modes (chat/history) |
| `entrypoints/sidepanel/App.tsx` | Unified header, simplified ChatList wiring |
| `entrypoints/home/pages/ChatPage.tsx` | Remove `updateConversation`, simplify ChatList usage |

## Verification

1. `npm run build` passes
2. Open sidepanel → shows empty state, not last conversation
3. Send a message → creates conversation, auto-saves
4. Click ☰ → shows history list with time groups
5. Click a history item → loads that conversation
6. Click + in history → starts new chat
7. Click ← in history → returns to current chat
8. Hover a history item → shows delete button
9. Delete works correctly
