# Plan: Ocbot Component Extension Loading

## Goal

Load the Ocbot extension as a Component Extension (hidden from chrome://extensions, cannot be uninstalled, auto-loaded on browser startup).

## Changes

### 1. Extension ID Constant

**File:** `chrome/common/extensions/extension_constants.h`

Add in `extension_misc` namespace:
```cpp
inline constexpr char kOcbotExtensionId[] = "gidimhmdbcpoeljccjcnodepmmjpfnmf";
```

### 2. Component Extension Allowlist

**File:** `chrome/browser/extensions/component_extensions_allowlist/allowlist.cc`

Add to the `kAllowed` set:
```cpp
extension_misc::kOcbotExtensionId,
```

Note: This set uses `base::MakeFixedFlatSet` — elements must be in **alphabetical order**.

### 3. Load Extension

**File:** `chrome/browser/extensions/component_loader.cc`

In `AddDefaultComponentExtensions()`, **before** the `AddDefaultComponentExtensionsWithBackgroundPages()` call, add loading logic.

Loading priority (3-level fallback):

```
1. --ocbot-extension-dir=<path>    (dev mode, command-line flag)
2. <user-data-dir>/ocbot-extension/ (OTA hot-updated version)
3. Resources/ocbot/                 (bundled version, shipped with app)
```

Core code:
```cpp
base::FilePath ocbot_path;
bool found = false;
bool is_dev = false;

// 1) Dev override
const base::CommandLine* command_line = base::CommandLine::ForCurrentProcess();
if (command_line->HasSwitch("ocbot-extension-dir")) {
  base::FilePath dev_path = command_line->GetSwitchValuePath("ocbot-extension-dir");
  if (base::PathExists(dev_path.Append(FILE_PATH_LITERAL("manifest.json")))) {
    ocbot_path = dev_path;
    found = true;
    is_dev = true;
  }
}

// 2) OTA updated version
if (!found) {
  base::FilePath user_data_dir;
  if (base::PathService::Get(chrome::DIR_USER_DATA, &user_data_dir)) {
    base::FilePath updated_path =
        user_data_dir.Append(FILE_PATH_LITERAL("ocbot-extension"));
    if (base::PathExists(updated_path.Append(FILE_PATH_LITERAL("manifest.json")))) {
      ocbot_path = updated_path;
      found = true;
    }
  }
}

// 3) Bundled fallback
if (!found) {
  base::FilePath resources_dir;
  CHECK(base::PathService::Get(chrome::DIR_RESOURCES, &resources_dir));
  ocbot_path = resources_dir.Append(FILE_PATH_LITERAL("ocbot"));
}

if (base::PathExists(ocbot_path)) {
  AddOrReplace(ocbot_path);
}
```

### 4. Auto-Open Side Panel on Extension Load

**File:** `chrome/browser/ui/views/side_panel/extensions/extension_side_panel_manager.cc`

In `OnExtensionLoaded()` callback, auto-open side panel when ocbot is detected:

```cpp
if (browser_ && ocbot::IsOcbotExtension(extension->id())) {
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(
          [](base::WeakPtr<BrowserWindowInterface> browser, ExtensionId ext_id) {
            if (!browser || !browser->GetWindow()) return;
            auto* side_panel_ui = browser->GetFeatures().side_panel_ui();
            if (!side_panel_ui) return;
            SidePanelEntry::Key key(SidePanelEntry::Id::kExtension, ext_id);
            side_panel_ui->Show(key);
          },
          browser_->GetWeakPtr(), extension->id()),
      base::Seconds(2));
}
```

### 5. Service Worker Permanent Keepalive

**File:** `extensions/browser/process_manager.h`

Add member variable to `ProcessManager` class for tracking ocbot extension's permanent keepalive:
```cpp
// ocbot: Map to track permanent keepalives for ocbot extensions.
// This keeps service workers alive permanently for ocbot extensions.
std::map<WorkerId, base::Uuid> ocbot_permanent_keepalives_;
```

Place after `service_worker_keepalives_` member, before `weak_ptr_factory_`.

**Why this is needed**: Chromium by default terminates service workers after they've been idle. The ocbot extension's service worker needs to run continuously for side panel communication and background functionality. Maintaining a permanent keepalive prevents Chromium from terminating ocbot's service worker.

## Key Decisions

- **Component Extension vs regular Extension**: Chose Component Extension because it doesn't appear in chrome://extensions, users cannot disable/uninstall it
- **Loading location**: In `AddDefaultComponentExtensions()`, right after PDF extension loading
- **3-level fallback**: dev → OTA → bundled — covers development, update, and factory scenarios
- **Auto-open 2-second delay**: Ensures UI is fully initialized before operating on side panel

## Known Pitfalls

- `ComponentLoader` owns `profile_` member, can be accessed directly
- `AddOrReplace()` takes `base::FilePath`, not a string
- `base::PathService::Get(chrome::DIR_USER_DATA, ...)` may return false in some environments (e.g., unit tests)
- `base::PathService::Get(chrome::DIR_RESOURCES, ...)` on macOS points to `Framework.framework/Resources/`
- Allowlist is a compile-time fixed flat_set — forgetting to add the ID causes extension load failure with no error
- Extension ID is determined by the `key` field in manifest.json — changing the key changes the ID
