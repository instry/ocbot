# Plan: Ocbot Toolbar Button & Side Panel UI

## Goal

Add a standalone Ocbot button to the browser toolbar (left of the avatar button) that toggles the Ocbot Side Panel on click.

## Changes

### 1. Register Command ID

**File:** `chrome/app/chrome_command_ids.h`

Add at end of file (after other IDC definitions):

```cpp
#define IDC_TOGGLE_OCBOT_SIDEPANEL  40400
#define IDC_CYCLE_OCBOT_PROVIDER    40401
// Reserve 40402-40409 for future ocbot commands
```

### 2. Define Ocbot Constants

**New file:** `chrome/browser/ui/ocbot/ocbot_constants.h`

Core content:
- `kOcbotExtensionId` — Extension ID constant (`"gidimhmdbcpoeljccjcnodepmmjpfnmf"`)
- `IsOcbotExtension(id)` — Check if an extension is ocbot
- `GetOcbotToolbarIcon()` — Return toolbar vector icon
- `GetOcbotToolbarImage()` — Return toolbar PNG icon (`ui::ImageModel`)

**New file:** `chrome/browser/ui/ocbot/ocbot_constants.cc`

Contains:
- Vector icon path data (`gfx::PathElement` array)
- PNG icon loading (via `ui::ResourceBundle::GetSharedInstance().GetImageSkiaNamed(IDR_OCBOT_TOOLBAR_ICON)`)

### 3. Side Panel Manager

**New file:** `chrome/browser/ui/ocbot/ocbot_side_panel_manager.h`
**New file:** `chrome/browser/ui/ocbot/ocbot_side_panel_manager.cc`

Two public functions:
- `ocbot::ToggleSidePanel(BrowserWindowInterface*)` — Toggle side panel
- `ocbot::OpenSidePanel(BrowserWindowInterface*)` — Force open side panel

Each function includes safety checks:
```cpp
auto* profile = browser_window->GetProfile();
auto* registry = extensions::ExtensionRegistry::Get(profile);
if (!registry->enabled_extensions().GetByID(kOcbotExtensionId)) return;
```

Side panel operation API:
```cpp
auto* side_panel_ui = browser_window->GetFeatures().side_panel_ui();
SidePanelEntry::Key key(SidePanelEntry::Id::kExtension, kOcbotExtensionId);
side_panel_ui->Toggle(key, SidePanelOpenTrigger::kToolbarButton);
```

### 4. Register Side Panel Entry ID

**File:** `chrome/browser/ui/views/side_panel/side_panel_entry_id.h`

Add `kOcbot` entry to the enum.

### 5. Register Action ID

**File:** `chrome/browser/ui/actions/chrome_action_id.h`

Add ocbot-related action ID enum values.

### 6. Register Browser Action

**File:** `chrome/browser/ui/browser_actions.cc`

Add ocbot action to the action registration list:
```cpp
actions::ActionItem::Builder(
    base::BindRepeating(&CreateToggleSidePanelActionCallback))
    .SetActionId(kActionOcbotToggleSidePanel)
    .SetText(u"Ocbot")
    .SetTooltipText(u"ocbot AI Browser")
    .SetImage(ocbot::GetOcbotToolbarImage())
    .SetProperty(actions::kActionItemPinnableKey, true)
    .SetVisible(true)
```

### 7. Toolbar Button

**File:** `chrome/browser/ui/views/toolbar/toolbar_view.cc`
**File:** `chrome/browser/ui/views/toolbar/toolbar_view.h`

Add member in `toolbar_view.h`:
```cpp
raw_ptr<ToolbarButton> ocbot_button_ = nullptr;
```

In `toolbar_view.cc` `Init()`, **before avatar button creation**, create standalone button:
```cpp
auto ocbot_btn = std::make_unique<ToolbarButton>(
    base::BindRepeating(
        [](base::WeakPtr<BrowserWindowInterface> bwi, const ui::Event&) {
          if (bwi) ocbot::ToggleSidePanel(bwi.get());
        },
        browser_->GetWeakPtr()));

// Load 24px product logo
const gfx::ImageSkia* logo =
    ui::ResourceBundle::GetSharedInstance().GetImageSkiaNamed(
        IDR_PRODUCT_LOGO_24_SHORTCUTS);
if (logo) {
  ocbot_btn->SetImageModel(views::Button::STATE_NORMAL,
                           ui::ImageModel::FromImageSkia(*logo));
}

ocbot_btn->SetTooltipText(u"ocbot AI Assistant");
ocbot_btn->SetAccessibleName(u"ocbot AI Assistant");
ocbot_button_ = AddChildView(std::move(ocbot_btn));
```

### 8. Keyboard Shortcut

**File:** `chrome/browser/ui/accelerator_table.cc`

Add Alt+O (Option+O on macOS) shortcut to `kAcceleratorMap[]`:
```cpp
// ocbot keyboard shortcut: Alt+O (Option+O on macOS)
#if !BUILDFLAG(IS_CHROMEOS)
    {ui::VKEY_O, ui::EF_ALT_DOWN, IDC_TOGGLE_OCBOT_SIDEPANEL},
#endif
```

Requires include: `#include "chrome/browser/ui/ocbot/ocbot_constants.h"`

### 9. Auto-Open Side Panel

**File:** `chrome/browser/ui/views/frame/browser_view.cc`

Two changes:

1. In `AddedToWidget()`, after `toolbar_->Init()`:
```cpp
// ocbot: Auto-open side panel on first browser window
ocbot::MaybeAutoOpenSidePanel(browser());
```

2. In `UpdateTabSearchBubbleHost()`, add null check for `toolbar_->tab_search_button()` (ocbot toolbar layout may cause tab_search_button to not exist):
```cpp
if (toolbar_->tab_search_button()) {
  tab_search_bubble_host_ = std::make_unique<TabSearchBubbleHost>(
      toolbar_->tab_search_button(), browser_.get());
  // ...
}
```

Requires include: `#include "chrome/browser/ui/ocbot/ocbot_side_panel_manager.h"`

### 10. Side Panel Localized Strings

**File:** `chrome/app/generated_resources.grd`

Add ocbot side panel localized strings:
```xml
<!-- ocbot Side Panel strings -->
<message name="IDS_SIDE_PANEL_OCBOT_TITLE" desc="Title for the ocbot side panel">
  ocbot
</message>
<message name="IDS_SIDE_PANEL_OCBOT_TOOLTIP" desc="Tooltip text for the ocbot toolbar button">
  Open ocbot AI assistant
</message>
```

### 11. Vector Icon

**New file:** `components/vector_icons/ocbot.icon`

960x960 canvas octopus vector icon with head, eyes, and four tentacles. Used as vector rendering alternative for the toolbar button.

### 12. Hide Ocbot Extension from Extension Toolbar

**File:** `chrome/browser/ui/toolbar/toolbar_actions_model.cc`

Add filter in `ShouldAddExtension()`:
```cpp
if (extension->id() == extension_misc::kOcbotExtensionId) {
  return false;  // Has standalone toolbar button
}
```

### 13. PNG Icon Resource Registration

**File:** `chrome/app/theme/chrome_unscaled_resources.grd`

Add resource declaration:
```xml
<include name="IDR_OCBOT_TOOLBAR_ICON" file="chromium/ocbot_toolbar_icon.png" type="BINDATA" />
```

Place `ocbot_toolbar_icon.png` in `chrome/app/theme/chromium/` directory.

### 14. BUILD.gn

**File:** `chrome/browser/ui/BUILD.gn`

Add ocbot .cc/.h files to sources.

### 15. Hide Chromium Side Panel Header for Ocbot

**File:** `chrome/browser/ui/views/side_panel/extensions/extension_side_panel_coordinator.cc`

In `CreateAndRegisterEntry()`, after creating the `SidePanelEntry`, disable the built-in header for ocbot:

```cpp
#include "chrome/browser/ui/ocbot/ocbot_constants.h"

// In CreateAndRegisterEntry(), before registry_->Register():
if (ocbot::IsOcbotExtension(extension_->id())) {
  entry->set_should_show_header(false);
}
```

This removes Chromium's built-in side panel header (extension icon + name + pin/close buttons). Ocbot's extension provides its own header with history toggle, new session, and close button.

**Why:** The built-in header duplicated the extension logo and name, wasting vertical space. Ocbot's custom header provides better UX with session management controls.

## Key Decisions

- **Standalone button vs extension pin**: Chose standalone toolbar button (left of avatar) over extension pinning mechanism. Benefit: fixed position, unaffected by user actions
- **PNG vs vector icon**: Using PNG (`IDR_PRODUCT_LOGO_24_SHORTCUTS`) because Ocbot logo details don't render well as vectors
- **Side Panel Entry ID**: Using `kExtension` type + extension ID as key, not a custom entry

## Known Pitfalls

- Widget add order in `ToolbarView::Init()` determines UI layout — ocbot button must be added before avatar
- `PinnedActionToolbarButton` and `ToolbarButton` are different types — changing button implementation requires updating the type declaration in `.h`
- Side panel auto-open needs 1-2 second delay (`base::Seconds(2)`) — too early will fail because UI isn't initialized
- `GetImageSkiaNamed()` may return null — must check before use
