# Plan: Browser Auto-Update (GitHub Releases)

## Goal

Enable Chrome-style silent browser auto-update: background download → notify user to relaunch → new version takes effect after restart.

## Architecture

```
GitHub Releases (instry/ocbot)                    Chromium Built-in UI
[v0.2.0: Ocbot-0.2.0.dmg]                        (no custom UI needed)
        |                                              |
        v                                              v
  OcbotBrowserUpdater          InstalledVersionPoller → UpgradeDetector
  (new, mirrors extension_updater)    (built-in, enabled via buildflag)
        |                                              |
  1. GET /releases/latest      Detects disk version ≠ running version
  2. Compare versions                  ↓
  3. Download DMG              BuildState::SetUpdate()
  4. Mount → rsync .app               ↓
  5. Unmount DMG               AppMenuIconController
        |                      (menu button turns green/yellow/red)
        v                      RelaunchNotificationController
  Disk .app updated             (shows "Relaunch to update" bubble)
        |                              |
        +--- User clicks relaunch → new version loads ---+
```

## Changes

### 1. Enable UpgradeDetector Infrastructure

**File:** `scripts/build.py`

Add `enable_update_notifications=true` to both official and dev GN flag groups. This enables:
- `InstalledVersionPoller` (periodic disk version check)
- `InstalledVersionMonitor` (FSEvents watching .app changes)
- `UpgradeDetector` → `AppMenuIconController` (menu green/yellow/red dot)
- `RelaunchNotificationController` (relaunch bubble)

### 2. Patch get_installed_version_mac.mm

**New patch:** `patches/v144/chrome/browser/upgrade_detector/get_installed_version_mac.mm.patch`

**Problem:** Upstream `GetInstalledVersion` calls `updater::CurrentlyInstalledVersion()` which returns the compile-time version (always equals running version), so UpgradeDetector never detects updates.

**Solution:** Replace with direct disk read from `Info.plist` using `[NSDictionary dictionaryWithContentsOfFile:]` which bypasses NSBundle's in-memory cache. After rsync replaces the .app, this returns the new version.

### 3. OcbotBrowserUpdater Class

**New file:** `chrome/browser/ocbot/browser_updater.h`
**New file:** `chrome/browser/ocbot/browser_updater.mm`

Mirrors the extension updater pattern but for the browser binary:

```cpp
namespace ocbot {
class OcbotBrowserUpdater {
 public:
  explicit OcbotBrowserUpdater(Profile* profile);
  void Start();  // 60s initial delay, then every 4h

 private:
  void CheckForUpdate();
  void OnReleaseFetched(std::optional<std::string> response_body);
  void DownloadDmg(const std::string& url, const std::string& version);
  void OnDmgDownloaded(const std::string& version, base::FilePath tmp);
  static bool InstallFromDmg(const base::FilePath& dmg, const base::FilePath& app);
  void OnInstallComplete(const std::string& version, bool success);
  std::string GetRunningVersion() const;   // reads CFBundleShortVersionString
  base::FilePath GetCurrentAppPath() const;
};
}
```

**Key constants:**
```cpp
constexpr char kGitHubReleasesApiUrl[] =
    "https://api.github.com/repos/instry/ocbot/releases/latest";
constexpr char kDmgAssetPrefix[] = "Ocbot-";
constexpr char kDmgAssetSuffix[] = ".dmg";
constexpr base::TimeDelta kInitialDelay = base::Seconds(60);
constexpr base::TimeDelta kCheckInterval = base::Hours(4);
constexpr int kMaxDmgSize = 500 * 1024 * 1024;  // 500 MB
```

**InstallFromDmgBlocking flow (background thread):**
1. `hdiutil attach <dmg> -mountpoint <tmp> -nobrowse -readonly`
2. Find `Ocbot.app` in mount point
3. `rsync -a --delete <mount>/Ocbot.app/ <current_app>/`
4. `hdiutil detach <mount> -quiet`
5. Delete temp DMG

**Version comparison:** `GetRunningVersion()` reads `CFBundleShortVersionString` from the running bundle (Ocbot product version like `0.1.0`), compared against GitHub tag version using `base::Version::CompareTo()`.

**Concurrency guard:** `CheckForUpdate()` skips if `url_loader_` is active (download in progress).

### 4. BUILD.gn and Integration

**Modified:** `chrome/browser/ocbot/BUILD.gn`
- Added `browser_updater.mm` and `browser_updater.h` to sources
- Added `//components/version_info` dep

**Modified:** `chrome/browser/extensions/component_loader.cc`
- Added `#include "chrome/browser/ocbot/browser_updater.h"`
- Start `OcbotBrowserUpdater` alongside existing extension updater (same `base::NoDestructor` pattern, skipped in dev mode)

### 5. Release Script

**Modified:** `scripts/release.py` — Added `release_browser()` function
**Modified:** `scripts/dev.py` — Registered `release-browser` subcommand

```bash
# Usage: build DMG first, then release
python dev.py package --official
python dev.py release-browser
```

## Update Detection Flow (no additional code needed)

After rsync replaces .app, Chromium's built-in mechanism takes over:
1. `InstalledVersionMonitor` (FSEvents) detects `/Applications/` file change
2. Triggers `InstalledVersionPoller` → calls `GetInstalledVersion`
3. Our patched `get_installed_version_mac.mm` reads new version from disk
4. `UpgradeDetector::UpgradeDetected()` → starts notification timer
5. `AppMenuIconController` → menu button turns green
6. `RelaunchNotificationController` → shows "Relaunch to update Ocbot" bubble
7. User relaunches → new version loads

## Key Decisions

- **Objective-C++ (.mm)**: `browser_updater.mm` needs ObjC for `NSBundle` access to read `CFBundleShortVersionString`
- **rsync over running .app**: macOS allows replacing a running .app because process binaries are already loaded in memory
- **No privilege escalation (v1)**: If rsync fails due to permissions, log warning and skip. Most users drag-install to `/Applications` and own write permission
- **Reuses Chromium UpgradeDetector UI**: No custom UI needed for relaunch prompts

## Known Pitfalls

- **GitHub API rate limiting**: Unauthenticated 60 req/hour, our 4h interval is safe
- **Shared release tag**: Both extension and browser use `/releases/latest`. If latest is extension-only (no DMG), browser updater logs warning and skips — harmless but noisy
- **Single `url_loader_`**: API check and DMG download share one loader; concurrency guard prevents timer from interrupting a download

## API Compatibility Notes (Chromium v144)

These issues were discovered during compilation and may recur when porting to newer Chromium versions:

- **`base::Value` types**: v144 uses `base::DictValue` / `base::ListValue`, not `base::Value::Dict` / `base::Value::List` (the newer API). JSON parsing uses `base::JSONReader::ReadDict()` returning `std::optional<base::DictValue>`.
- **`version_info::GetVersionNumber()`**: Returns `std::string_view`, not `std::string`. Must explicitly convert: `std::string(version_info::GetVersionNumber())`.
- **`BindOnce` parameter order for `PostTaskAndReplyWithResult`**: Pre-bound parameters in the reply callback must match the function signature left-to-right. `OnInstallComplete(const std::string& version, bool success)` — `version` is pre-bound, `success` comes from the task result. Reversing the parameter order causes a compile-time type mismatch.
