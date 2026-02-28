# Session Management Redesign

**Status:** Implemented

**Goal:** Redesign session management so sidepanel always opens fresh, with unified history UI across home page and sidepanel.

## What Was Done

### 1. Session Lifecycle

- Sidepanel always opens to empty "How can I help?" state (no auto-restore)
- Conversations auto-save on message change
- `ocbot_pending_message` sends new messages from home → sidepanel
- `ocbot_load_conversation` loads existing conversations from home → sidepanel

### 2. Data Model Simplification

- Removed `pinned` field from `Conversation` type
- Removed `updateConversation` (no more pin/rename)
- `loadConversation` falls back to storage read on mount race condition

### 3. Shared `ChatList` Component

`ocbot_agent/components/ChatList.tsx` — used by both home sidebar and sidepanel:
- Flat list sorted by recency (no time grouping)
- "HISTORY" label header
- Hover-visible delete button per item
- Load-more pagination (20 items per page)
- Optional `activeConversationId` for highlight

### 4. Home Page Sidebar

`ocbot_agent/entrypoints/home/components/Sidebar.tsx`:
- Top: bot logo + "ocbot"
- "New Session" button
- `<ChatList>` with conversation history (live-synced via `chrome.storage.onChanged`)
- Bottom nav: Skills / Remote / Settings
- Click history item → writes `ocbot_load_conversation` → opens sidepanel

### 5. Sidepanel Header

`ocbot_agent/entrypoints/sidepanel/components/Header.tsx` — two modes:

Chat view: `[☰] [✏️]` left, `[✕]` right
- ☰ toggles history view
- ✏️ new session
- ✕ closes side panel (`window.close()`)

History view: `[←] History` left, `[✕]` right
- ← returns to chat

### 6. Chromium Side Panel Header Hidden

`chrome/browser/ui/views/side_panel/extensions/extension_side_panel_coordinator.cc`:
- Added `entry->set_should_show_header(false)` for ocbot extension
- Removes Chromium's built-in header (icon + extension name + close button)
- Ocbot's own header replaces it

## Files Changed

| File | Change |
|------|--------|
| `ocbot_agent/lib/types.ts` | Removed `pinned` from Conversation |
| `ocbot_agent/lib/hooks/useChat.ts` | No auto-restore, removed `updateConversation`, async `loadConversation` |
| `ocbot_agent/components/ChatList.tsx` | Shared flat-list component with load-more |
| `ocbot_agent/components/WelcomeHero.tsx` | Shared hero component (lg/sm sizes) |
| `ocbot_agent/entrypoints/sidepanel/components/Header.tsx` | Two-mode header with close button |
| `ocbot_agent/entrypoints/sidepanel/App.tsx` | Unified header, `ocbot_load_conversation` listener |
| `ocbot_agent/entrypoints/home/components/Sidebar.tsx` | History list using shared ChatList |
| `ocbot_agent/entrypoints/home/App.tsx` | `onSelectConversation` handler |
| `ocbot_agent/entrypoints/home/pages/ChatPage.tsx` | Simplified ChatList usage |
| `extension_side_panel_coordinator.cc` | `set_should_show_header(false)` for ocbot |
