# Plan: Home Page (oc://home)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-page home screen (`oc://home`) that replaces the new tab page, with a left sidebar menu and right content area — starting with Chat.

**Architecture:** Register `oc://` as a custom URL scheme in Chromium, with a `BrowserURLHandler` that rewrites `oc://<path>` to `chrome-extension://<ocbot-id>/home.html#/<path>`. The extension gains a new WXT `home` entrypoint with a sidebar layout. Chat components are shared between home and sidepanel. The side panel no longer auto-opens on startup.

**Tech Stack:** C++ (Chromium patches), React + TypeScript + Tailwind (extension UI), WXT (extension build)

---

## Task 1: Register `oc://` URL Scheme in Chromium

**Files:**
- Modify: `chrome/common/url_constants.h`
- Modify: `chrome/common/url_constants.cc`
- Modify: `chrome/common/chrome_content_client.cc` (line ~187-201, ~203-281)

**Step 1: Add scheme and host constants**

In `chrome/common/url_constants.h`, add alongside existing scheme constants:

```cpp
// ocbot custom scheme
inline constexpr char kOcScheme[] = "oc";
inline constexpr char kOcHomeHost[] = "home";
inline constexpr char kOcHomeURL[] = "oc://home/";
```

In `chrome/common/url_constants.cc`, no changes needed (constants are inline constexpr in header).

**Step 2: Register `oc` as a standard secure scheme**

In `chrome/common/chrome_content_client.cc`, add `"oc"` to `kChromeStandardURLSchemes`:

```cpp
static const char* const kChromeStandardURLSchemes[] = {
#if BUILDFLAG(ENABLE_EXTENSIONS_CORE)
    extensions::kExtensionScheme,
#endif
    // ... existing entries ...
    chrome::kOcScheme,  // ocbot: custom oc:// scheme
};
```

And in `AddAdditionalSchemes()`, mark it as secure:

```cpp
// ocbot: oc:// is secure (redirects to chrome-extension://)
schemes->secure_schemes.push_back(chrome::kOcScheme);
```

**Step 3: Build and verify**

Run: `python3 ocbot/scripts/dev.py build`

---

## Task 2: Add URL Rewrite Handler (oc:// → extension page)

**Files:**
- Create: `chrome/browser/ui/ocbot/ocbot_url_handler.h`
- Create: `chrome/browser/ui/ocbot/ocbot_url_handler.cc`
- Modify: `chrome/browser/chrome_content_browser_client.cc` (~line 4937-4966)
- Modify: `chrome/browser/ui/BUILD.gn`

**Step 1: Create the URL handler**

`chrome/browser/ui/ocbot/ocbot_url_handler.h`:

```cpp
#ifndef CHROME_BROWSER_UI_OCBOT_OCBOT_URL_HANDLER_H_
#define CHROME_BROWSER_UI_OCBOT_OCBOT_URL_HANDLER_H_

namespace content {
class BrowserContext;
}

class GURL;

namespace ocbot {

// Rewrites oc://<path> to chrome-extension://<ocbot-id>/home.html#/<path>
// Returns true if the URL was rewritten.
bool HandleOcURL(GURL* url, content::BrowserContext* browser_context);

// Reverse handler: rewrites extension URL back to oc:// for omnibox display.
bool HandleOcURLReverse(GURL* url, content::BrowserContext* browser_context);

}  // namespace ocbot

#endif  // CHROME_BROWSER_UI_OCBOT_OCBOT_URL_HANDLER_H_
```

`chrome/browser/ui/ocbot/ocbot_url_handler.cc`:

```cpp
#include "chrome/browser/ui/ocbot/ocbot_url_handler.h"

#include "chrome/browser/ui/ocbot/ocbot_constants.h"
#include "chrome/common/url_constants.h"
#include "extensions/common/constants.h"
#include "url/gurl.h"

namespace ocbot {

bool HandleOcURL(GURL* url, content::BrowserContext* browser_context) {
  if (!url->SchemeIs(chrome::kOcScheme)) {
    return false;
  }

  // oc://home → chrome-extension://<id>/home.html#/home
  // oc://settings → chrome-extension://<id>/home.html#/settings
  std::string path = url->GetHost();
  if (url->has_path() && url->path() != "/") {
    path += url->path();
  }
  if (path.empty()) {
    path = "home";
  }

  *url = GURL(std::string(extensions::kExtensionScheme) + "://" +
              kOcbotExtensionId + "/home.html#/" + path);
  return true;
}

bool HandleOcURLReverse(GURL* url, content::BrowserContext* browser_context) {
  if (!url->SchemeIs(extensions::kExtensionScheme) ||
      url->host() != kOcbotExtensionId ||
      !url->path_piece().starts_with("/home.html")) {
    return false;
  }

  // chrome-extension://<id>/home.html#/home → oc://home
  std::string ref = url->ref();
  if (ref.starts_with("/")) {
    ref = ref.substr(1);
  }
  if (ref.empty()) {
    ref = "home";
  }

  *url = GURL(std::string(chrome::kOcScheme) + "://" + ref);
  return true;
}

}  // namespace ocbot
```

**Step 2: Register the handler**

In `chrome/browser/chrome_content_browser_client.cc`, inside `BrowserURLHandlerCreated()`, add the oc:// handler **before** the WebUI handler:

```cpp
#include "chrome/browser/ui/ocbot/ocbot_url_handler.h"

// ... inside BrowserURLHandlerCreated():

// ocbot: Rewrite oc:// URLs to extension page
handler->AddHandlerPair(&ocbot::HandleOcURL, &ocbot::HandleOcURLReverse);
```

**Step 3: Add files to BUILD.gn**

In `chrome/browser/ui/BUILD.gn`, add to the ocbot source files section:

```gn
"ocbot/ocbot_url_handler.cc",
"ocbot/ocbot_url_handler.h",
```

**Step 4: Build and verify**

Run: `python3 ocbot/scripts/dev.py build`

---

## Task 3: Redirect NTP to oc://home

**Files:**
- Modify: `chrome/browser/ui/browser.cc` (~line 771-776)

**Step 1: Change GetNewTabURL to return oc://home**

```cpp
#include "chrome/common/url_constants.h"

GURL Browser::GetNewTabURL() const {
  if (auto* const app_browser_controller = app_controller()) {
    return app_browser_controller->GetAppNewTabUrl();
  }
  // ocbot: Use oc://home instead of chrome://newtab
  return GURL(chrome::kOcHomeURL);
}
```

**Step 2: Build and verify**

Run: `python3 ocbot/scripts/dev.py build`

---

## Task 4: Remove side panel auto-open on startup

**Files:**
- Modify: `chrome/browser/ui/views/frame/browser_view.cc`
- Modify: `chrome/browser/ui/ocbot/ocbot_side_panel_manager.h`
- Modify: `chrome/browser/ui/ocbot/ocbot_side_panel_manager.cc`

**Step 1: Remove MaybeAutoOpenSidePanel call from browser_view.cc**

In `browser_view.cc`, find and remove the line:

```cpp
// ocbot: Auto-open side panel on first browser window
ocbot::MaybeAutoOpenSidePanel(browser());
```

**Step 2: Remove MaybeAutoOpenSidePanel function**

In `ocbot_side_panel_manager.h`, remove:

```cpp
void MaybeAutoOpenSidePanel(BrowserWindowInterface* browser_window);
```

In `ocbot_side_panel_manager.cc`, remove the `g_did_auto_open` variable, `kAutoOpenDelay` constant, and entire `MaybeAutoOpenSidePanel()` function.

**Step 3: Build and verify**

Run: `python3 ocbot/scripts/dev.py build`

---

## Task 5: Lift shared chat components out of sidepanel

**Files:**
- Move: `entrypoints/sidepanel/hooks/useChat.ts` → `lib/hooks/useChat.ts`
- Move: `entrypoints/sidepanel/hooks/useInputHistory.ts` → `lib/hooks/useInputHistory.ts`
- Move: `entrypoints/sidepanel/components/ChatArea.tsx` → `components/ChatArea.tsx`
- Move: `entrypoints/sidepanel/components/ChatInput.tsx` → `components/ChatInput.tsx`
- Move: `entrypoints/sidepanel/components/ChatList.tsx` → `components/ChatList.tsx`
- Move: `entrypoints/sidepanel/components/MessageBubble.tsx` → `components/MessageBubble.tsx`
- Move: `entrypoints/sidepanel/components/BotAvatar.tsx` → `components/BotAvatar.tsx`
- Update: `entrypoints/sidepanel/App.tsx` — fix all imports to new paths

**Step 1: Create shared directories and move files**

```bash
mkdir -p lib/hooks
mkdir -p components

# Move hooks
mv entrypoints/sidepanel/hooks/useChat.ts lib/hooks/useChat.ts
mv entrypoints/sidepanel/hooks/useInputHistory.ts lib/hooks/useInputHistory.ts

# Move shared components
mv entrypoints/sidepanel/components/ChatArea.tsx components/ChatArea.tsx
mv entrypoints/sidepanel/components/ChatInput.tsx components/ChatInput.tsx
mv entrypoints/sidepanel/components/ChatList.tsx components/ChatList.tsx
mv entrypoints/sidepanel/components/MessageBubble.tsx components/MessageBubble.tsx
mv entrypoints/sidepanel/components/BotAvatar.tsx components/BotAvatar.tsx
```

**Step 2: Update imports in all moved files**

Any relative imports like `'../../../lib/...'` become `'@/lib/...'`. Any relative imports to sibling components like `'./MessageBubble'` become `'@/components/MessageBubble'`.

**Step 3: Update sidepanel App.tsx imports**

Change all imports from local `./components/X` and `./hooks/X` to `@/components/X` and `@/lib/hooks/X`. Keep sidepanel-only components (`Header.tsx`, `Settings.tsx`, `ChannelSettings.tsx`) in `entrypoints/sidepanel/components/`.

**Step 4: Verify extension build**

Run: `cd ocbot_agent && npm run build`

---

## Task 6: Create home page WXT entrypoint

**Files:**
- Create: `entrypoints/home/index.html`
- Create: `entrypoints/home/main.tsx`
- Create: `entrypoints/home/App.tsx`
- Create: `entrypoints/home/components/Sidebar.tsx`
- Create: `entrypoints/home/pages/ChatPage.tsx`

**Step 1: Create HTML entry**

`entrypoints/home/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ocbot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**Step 2: Create React entry**

`entrypoints/home/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/assets/main.css'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 3: Create Sidebar component**

`entrypoints/home/components/Sidebar.tsx`:

```tsx
import { MessageSquare, Puzzle, Settings } from 'lucide-react'

type Page = 'chat' | 'skills' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const navItems: { id: Page; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border/40 bg-muted/30">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/icon/icon32.png" alt="ocbot" className="h-6 w-6" />
        <span className="text-base font-semibold">ocbot</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              activePage === id
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
```

**Step 4: Create ChatPage**

`entrypoints/home/pages/ChatPage.tsx`:

```tsx
import { ChatArea } from '@/components/ChatArea'
import { ChatInput } from '@/components/ChatInput'
import { ChatList } from '@/components/ChatList'
import { useChat } from '@/lib/hooks/useChat'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { useState } from 'react'
import { PanelLeft, SquarePen } from 'lucide-react'

export function ChatPage() {
  const { providers, selectedProvider, selectProvider } = useLlmProvider()
  const {
    messages, conversationId, conversations, streamingText, isLoading,
    toolStatuses, error, sendMessage, stopAgent, newChat,
    loadConversation, updateConversation, removeConversation,
  } = useChat(selectedProvider)
  const [showChatList, setShowChatList] = useState(false)

  if (showChatList) {
    return (
      <ChatList
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectChat={(id) => { loadConversation(id); setShowChatList(false) }}
        onPinChat={(id, pinned) => updateConversation(id, { pinned })}
        onRenameChat={(id, title) => updateConversation(id, { title })}
        onDeleteChat={removeConversation}
        onClose={() => setShowChatList(false)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border/40 px-3 py-2">
        <button
          onClick={() => setShowChatList(true)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="Chat list"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={newChat}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="New chat"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>
      <ChatArea
        hasProvider={!!selectedProvider}
        onOpenSettings={() => {/* TODO: navigate to settings page */}}
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
      />
    </div>
  )
}
```

**Step 5: Create App with sidebar layout**

`entrypoints/home/App.tsx`:

```tsx
import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatPage } from './pages/ChatPage'

type Page = 'chat' | 'skills' | 'settings'

export function App() {
  const [page, setPage] = useState<Page>(() => {
    // Read initial page from URL hash: #/chat, #/settings, etc.
    const hash = window.location.hash.replace('#/', '')
    if (hash === 'skills' || hash === 'settings') return hash
    return 'chat'
  })

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-hidden">
        {page === 'chat' && <ChatPage />}
        {page === 'skills' && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Skills — coming soon
          </div>
        )}
        {page === 'settings' && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Settings — coming soon
          </div>
        )}
      </main>
    </div>
  )
}
```

**Step 6: Verify extension build**

Run: `cd ocbot_agent && npm run build`

Verify `home.html` appears in `.output/chrome-mv3/`.

---

## Task 7: Full build, generate patches, commit

**Step 1: Full Chromium build**

Run: `python3 ocbot/scripts/dev.py build`

**Step 2: Generate patches**

Run: `python3 ocbot/scripts/dev.py update_patches`

**Step 3: Commit ocbot_agent changes**

```bash
cd ocbot/ocbot_agent
git add -A
git commit -m "feat: add home page entrypoint with sidebar layout and shared chat components"
```

**Step 4: Commit ocbot repo (patches + plan)**

```bash
cd ocbot
git add plans/05-home-page.md patches/
git commit -m "feat: add oc://home page — plan and patches"
```

---

## Key Decisions

- **Extension page over WebUI**: UI iterations ship via OTA without recompiling the browser.
- **BrowserURLHandler rewrite**: Simplest interception mechanism — single handler pair, no WebUI plumbing needed.
- **Hash-based routing**: `home.html#/<path>` lets the extension handle all routing client-side with a single HTML entry point.
- **Shared components via `@/components/` and `@/lib/hooks/`**: Avoids duplication between sidepanel and home page.
- **Fixed-width sidebar (w-56 / 224px)**: Matches user preference, always shows icon + label.

## Known Pitfalls

- `oc://` scheme must be registered before `url::LockSchemeRegistries()` is called — the `kChromeStandardURLSchemes` array is processed early enough.
- **GURL API returns `string_view`**: `url->host()`, `url->path()`, and `url->ref()` return `std::string_view` in Chromium 144+. Must use explicit `std::string()` construction (e.g., `std::string(url->host())`), not `std::string path = url->host()`.
- **No `path_piece()` method**: Use `url->path()` instead of `url->path_piece()` — the latter doesn't exist in current GURL API.
- WXT may need the `home` entrypoint to be an "unlisted-page" type if it doesn't auto-detect from the `entrypoints/home/` directory structure — check WXT docs if build doesn't include `home.html`.
- `GetNewTabURL()` returns a `GURL` that then goes through `BrowserURLHandler` rewriting — so returning `oc://home` will correctly trigger the oc:// handler and get rewritten to the extension URL.
- The reverse handler (`HandleOcURLReverse`) makes the omnibox show `oc://home` instead of the long `chrome-extension://` URL.
