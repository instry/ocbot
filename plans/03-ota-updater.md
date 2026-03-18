# Plan: Extension OTA Hot Update (GitHub Releases)

## Goal

Enable the Ocbot extension to hot-update independently via GitHub Releases, so users don't need to re-download the entire browser.

## Architecture

```
Browser startup → Load extension (3-level fallback, see 02-component-extension.md)
  → Delay 30s, background thread GET GitHub Releases API
  → Compare version numbers
  → New version available → Download zip → Extract to <user-data-dir>/ocbot-extension/
  → Hot-reloads extension immediately (Remove old → Add from OTA dir)
  → Check every 4 hours thereafter
```

## Changes

### 1. New OcbotExtensionUpdater Class

**New file:** `chrome/browser/ocbot/extension_updater.h`
**New file:** `chrome/browser/ocbot/extension_updater.cc`

Class definition:
```cpp
namespace ocbot {
class OcbotExtensionUpdater {
 public:
  explicit OcbotExtensionUpdater(Profile* profile);
  ~OcbotExtensionUpdater();
  void Start();

  // Hot-reload callback: set by component_loader to Remove+Add extension.
  using ReloadCallback = base::RepeatingClosure;
  void SetReloadCallback(ReloadCallback callback);

 private:
  void CheckForUpdate();
  void OnReleaseFetched(std::optional<std::string> response_body);
  void DownloadZip(const std::string& download_url, const std::string& remote_version);
  void OnZipDownloaded(const std::string& remote_version, base::FilePath temp_path);
  void ReloadExtension();  // Calls reload_callback_ if set, else logs restart-needed
  std::string GetCurrentVersion() const;
  base::FilePath GetUpdateDir() const;
  network::mojom::URLLoaderFactory* GetURLLoaderFactory();

  raw_ptr<Profile> profile_;
  base::RepeatingTimer check_timer_;
  std::unique_ptr<network::SimpleURLLoader> url_loader_;
  ReloadCallback reload_callback_;
  base::WeakPtrFactory<OcbotExtensionUpdater> weak_factory_{this};
};
}
```

**Key configuration constants:**
```cpp
constexpr char kGitHubReleasesApiUrl[] =
    "https://api.github.com/repos/instry/ocbot/releases/latest";
constexpr char kZipAssetName[] = "ocbot-extension.zip";
constexpr char kUpdateDirName[] = "ocbot-extension";
constexpr base::TimeDelta kInitialDelay = base::Seconds(30);
constexpr base::TimeDelta kCheckInterval = base::Hours(4);
constexpr int kMaxApiResponseSize = 256 * 1024;   // 256 KB
constexpr int kMaxZipSize = 50 * 1024 * 1024;     // 50 MB
```

**Flow details:**

1. `Start()`: Use `base::RepeatingTimer` every 4 hours, plus `PostDelayedTask` for first check after 30 seconds
2. `CheckForUpdate()`: Use `network::SimpleURLLoader` to GET GitHub API, set `Accept: application/vnd.github.v3+json`
3. `OnReleaseFetched()`: Parse JSON, extract `tag_name` (supports both `ext-v0.3.0` and `v0.3.0` formats), find `ocbot-extension.zip` asset's `browser_download_url`
4. Version comparison: `base::Version` class's `CompareTo()`
5. `DownloadZip()`: `SimpleURLLoader::DownloadToTempFile()`, max 50 MB
6. `OnZipDownloaded()`: Extract on `base::ThreadPool` background thread (`zip::Unzip`), then back to UI thread
7. Extraction handles nested directories (e.g., if zip contains `chrome-mv3/` subdirectory, automatically descend into it)
8. Atomic replacement: Extract to temp directory first, verify `manifest.json` exists, then `base::Move` to target directory

**Network traffic annotation:**
Must define `net::NetworkTrafficAnnotationTag` describing the network request's purpose (Chromium security audit requirement).

### 2. BUILD.gn

**New file:** `chrome/browser/ocbot/BUILD.gn`

```gn
source_set("ocbot") {
  sources = [
    "extension_updater.cc",
    "extension_updater.h",
  ]
  deps = [
    "//base",
    "//chrome/browser/profiles:profile",
    "//chrome/common",
    "//content/public/browser",
    "//extensions/browser",
    "//extensions/common",
    "//net",
    "//services/network/public/cpp",
    "//services/network/public/mojom",
    "//third_party/zlib/google:zip",
  ]
}
```

**File:** `chrome/browser/extensions/BUILD.gn`

Add `"//chrome/browser/ocbot"` to `source_set("extensions")` deps.

### 3. Register in Startup Flow

**File:** `chrome/browser/extensions/component_loader.cc`

After loading the ocbot extension, create and start the updater:
```cpp
if (profile_ && !is_dev) {
  static base::NoDestructor<std::unique_ptr<ocbot::OcbotExtensionUpdater>> g_updater;
  if (!*g_updater) {
    *g_updater = std::make_unique<ocbot::OcbotExtensionUpdater>(profile_);
    (*g_updater)->Start();

    // Hot-reload callback: Remove old extension by ID, re-add from OTA dir.
    base::FilePath ota_path = user_data_dir.Append("ocbot-extension");
    (*g_updater)->SetReloadCallback(base::BindRepeating(
        [](ComponentLoader* loader, const base::FilePath& path) {
          loader->Remove("gidimhmdbcpoeljccjcnodepmmjpfnmf");
          auto manifest = file_util::LoadManifest(path, &error);
          if (manifest) loader->Add(std::move(*manifest), path, true);
        },
        base::Unretained(this), ota_path));
  }
}
```

Skipped when `is_dev` is true (launched with `--ocbot-extension-dir`).

### 4. Release Script

**New file:** `ocbot/scripts/release-extension.sh`

```bash
#!/bin/bash
# Build extension → zip → publish to GitHub Releases
VERSION=$(extract from wxt.config.ts)
cd extension && npm run build
cd .output/chrome-mv3 && zip -r ocbot-extension.zip .
gh release create "ext-v${VERSION}" ocbot-extension.zip
```

## Key Decisions

- **Hot-reload via callback**: `component_loader.cc` sets a `ReloadCallback` on the updater that calls `Remove(old_id)` + `Add(new_manifest, ota_path)`. This avoids circular includes between `chrome/browser/extensions/` and `chrome/browser/ocbot/` — the updater doesn't need to know about `ComponentLoader`
- **Updater starts in component_loader.cc**: Simplest integration point, avoids modifying chrome_browser_main.cc
- **Using `base::NoDestructor`**: Static singleton, only one updater instance for the entire browser lifetime
- **Not using Chrome Web Store update mechanism**: Component extensions don't support the standard `update_url`

## Known Pitfalls

- **Chromium version API differences**:
  - `base::Value::Dict` / `base::Value::List` became `base::DictValue` / `base::ListValue` in some versions
  - `base::JSONReader::Read(json)` requires two arguments in some versions: `ReadDict(json, options)`
  - `SimpleURLLoader::BodyAsStringCallback` changed from `std::unique_ptr<std::string>` to `std::optional<std::string>`
  - Need `#include "base/files/file_enumerator.h"` to use `base::FileEnumerator`
- **Circular dependency**: `chrome/browser/ocbot` cannot include `chrome/browser/extensions/component_loader.h` (creates circular deps), so hot-reload is implemented via a callback (`ReloadCallback`) set by `component_loader.cc` on the updater, rather than direct calls
- **GitHub API rate limiting**: Unauthenticated requests limited to 60/hour, normal usage (once per 4 hours) won't trigger this
- **Zip structure**: Build artifacts may have nested directories (`chrome-mv3/`), extraction must detect and handle this
- **NetworkTrafficAnnotation**: Chromium requires all network requests to have traffic annotations, format is specific proto text
