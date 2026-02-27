# Plan: Home Page (oc://home)

## Goal

Add a full-page home screen at `oc://home` that opens on browser startup. Left sidebar menu (Chat, Skills, Settings), right content area. Chat reuses sidepanel components. New tabs still open the default Chrome NTP.

## Architecture

Register `oc://` as a custom URL scheme in Chromium. A `BrowserURLHandler` pair rewrites `oc://<path>` → `chrome-extension://<ocbot-id>/home.html#/<path>` (and reverse, so the omnibox shows `oc://home`). The extension has a WXT `home` entrypoint with a sidebar layout. Chat components are shared between home and sidepanel via `@/components/` and `@/lib/hooks/`. The side panel does not auto-open on startup.

## Implementation Details

### 1. Register `oc://` URL Scheme

**Target:** `chrome/common/url_constants.h`, `chrome/common/chrome_content_client.cc`

**Logic:**

Define constants for the scheme, host, and full URL:
```cpp
inline constexpr char kOcScheme[] = "oc";
inline constexpr char kOcHomeHost[] = "home";
inline constexpr char kOcHomeURL[] = "oc://home/";
```

Register `kOcScheme` as a standard URL scheme (add to the `kChromeStandardURLSchemes` array) and as a secure scheme (in `AddAdditionalSchemes()`). This must happen before `url::LockSchemeRegistries()` is called.

### 2. URL Rewrite Handler

**Target:** New files `chrome/browser/ui/ocbot/ocbot_url_handler.h/.cc`, `chrome/browser/chrome_content_browser_client.cc`, `chrome/browser/ui/BUILD.gn`

**Logic:**

Create a `BrowserURLHandler` pair:

- **Forward** (`HandleOcURL`): If URL scheme is `oc://`, extract host+path as the route (default to `"home"`), rewrite to `chrome-extension://<ocbot-id>/home.html#/<route>`.
- **Reverse** (`HandleOcURLReverse`): If URL is `chrome-extension://<ocbot-id>/home.html*`, extract hash fragment as the route, rewrite to `oc://<route>`. This makes the omnibox display `oc://home` instead of the extension URL.

Register the pair via `handler->AddHandlerPair()` in `BrowserURLHandlerCreated()`, **before** the WebUI handler.

Add both files to the ocbot section of `chrome/browser/ui/BUILD.gn`.

### 3. Browser Startup Opens oc://home

**Target:** `chrome/browser/ui/startup/startup_tab_provider.cc`, `chrome/browser/ui/startup/startup_browser_creator_impl.cc`

**Logic:**

**Important:** `Browser::GetNewTabURL()` is NOT changed — new tabs open the default Chrome NTP.

Three startup code paths need to use `oc://home` instead of `chrome://newtab`:

1. **Default startup page** — In `StartupTabProviderImpl::GetNewTabPageTabsForState()`, replace the `chrome://newtab` tab with `oc://home`.
2. **Incognito/guest fallback** — In `startup_browser_creator_impl.cc`, where a `StartupTab(GURL(chrome::kChromeUINewTabURL))` is returned as fallback for incognito/guest profiles, use `kOcHomeURL` instead.
3. **Session restore failure fallback** — In the same file, where `kChromeUINewTabURL` is used as fallback when session restore fails, use `kOcHomeURL` instead.
4. **Disable session restore bypass** — The `SYNCHRONOUS_RESTORE` behavior in `DetermineBrowserOpenBehavior()` completely bypasses computed startup tabs. Disable this path to ensure `oc://home` is used.

### 4. Remove Side Panel Auto-Open

**Target:** `chrome/browser/ui/views/frame/browser_view.cc`, `chrome/browser/ui/ocbot/ocbot_side_panel_manager.h/.cc`

**Logic:**

Remove the `MaybeAutoOpenSidePanel()` function and its call site in `BrowserView::AddedToWidget()`. The side panel should not auto-open on startup, but manual toggle via toolbar button still works.

Remove: the `g_did_auto_open` static variable, the `kAutoOpenDelay` constant, and the entire `MaybeAutoOpenSidePanel()` function declaration and definition.

### 5. Shared Chat Components (Extension)

**Target:** Extension source tree (`ocbot_agent/`)

**Logic:**

Move chat-related components from sidepanel-specific directories to shared locations:

| From | To |
|------|-----|
| `entrypoints/sidepanel/hooks/useChat.ts` | `lib/hooks/useChat.ts` |
| `entrypoints/sidepanel/hooks/useInputHistory.ts` | `lib/hooks/useInputHistory.ts` |
| `entrypoints/sidepanel/components/ChatArea.tsx` | `components/ChatArea.tsx` |
| `entrypoints/sidepanel/components/ChatInput.tsx` | `components/ChatInput.tsx` |
| `entrypoints/sidepanel/components/ChatList.tsx` | `components/ChatList.tsx` |
| `entrypoints/sidepanel/components/MessageBubble.tsx` | `components/MessageBubble.tsx` |
| `entrypoints/sidepanel/components/BotAvatar.tsx` | `components/BotAvatar.tsx` |

Update all imports to use `@/components/` and `@/lib/hooks/` aliases. Keep sidepanel-only components (`Header.tsx`, `Settings.tsx`, `ChannelSettings.tsx`) in `entrypoints/sidepanel/components/`.

### 6. Home Page WXT Entrypoint (Extension)

**Target:** New `entrypoints/home/` directory in extension source tree

**Logic:**

Create a new WXT unlisted-page entrypoint:

- `entrypoints/home/index.html` — Standard HTML entry, references `main.tsx`
- `entrypoints/home/main.tsx` — React bootstrap, imports shared `@/assets/main.css`
- `entrypoints/home/App.tsx` — Full-screen layout with sidebar + content area. Reads initial page from URL hash (`#/chat`, `#/settings`, etc.). Default page is `chat`.
- `entrypoints/home/components/Sidebar.tsx` — Fixed-width sidebar (w-56 / 224px) with icon + text nav items: Chat, Skills, Settings. Uses lucide-react icons.
- `entrypoints/home/pages/ChatPage.tsx` — Reuses shared `ChatArea`, `ChatInput`, `ChatList`, `useChat` from `@/components/` and `@/lib/hooks/`. Has its own toolbar with chat list toggle and new chat button.

Skills and Settings pages are placeholder ("coming soon") for now.

WXT auto-detects the `entrypoints/home/` directory and outputs `home.html` in the build.

## Key Decisions

- **Extension page over WebUI**: UI iterations ship via OTA without recompiling the browser.
- **BrowserURLHandler rewrite**: Simplest interception — single handler pair, no WebUI plumbing needed.
- **Hash-based routing**: `home.html#/<path>` lets the extension handle all routing client-side with a single HTML entry point.
- **Shared components via `@/components/` and `@/lib/hooks/`**: Avoids duplication between sidepanel and home page.
- **Fixed-width sidebar (224px)**: Always shows icon + label, no collapse state needed.
- **New tab = default NTP, startup = oc://home**: Users expect new tabs to behave normally. Only the initial browser launch goes to the home page.

## Known Pitfalls

- **Scheme registration timing**: `oc://` must be in `kChromeStandardURLSchemes` (processed before `LockSchemeRegistries()`). Adding it in `AddAdditionalSchemes()` alone is too late for the standard-scheme registration.
- **GURL API types vary**: `url->host()`, `url->path()`, `url->ref()` may return `std::string` or `std::string_view` depending on Chromium version. Always use explicit `std::string()` construction to be safe.
- **GURL method names vary**: Some versions have `path_piece()`, others only have `path()`. Prefer `path()` for portability.
- **Startup vs NTP are different code paths**: `Browser::GetNewTabURL()` only controls the "new tab" button. Browser startup page is determined by `GetNewTabPageTabsForState()` and fallbacks in `startup_browser_creator_impl.cc`. They must be changed independently.
- **Session restore bypasses startup tabs**: `SYNCHRONOUS_RESTORE` in `DetermineBrowserOpenBehavior()` completely ignores computed startup tabs. Must disable this path for `oc://home` to take effect.
- **Reverse handler for omnibox**: Without `HandleOcURLReverse`, the omnibox shows the raw `chrome-extension://` URL. The reverse handler is needed for a clean `oc://home` display.
- **WXT entrypoint detection**: WXT auto-detects `entrypoints/home/` with an `index.html` as an unlisted page. If not detected, check WXT docs for explicit entrypoint configuration.
