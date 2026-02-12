# Development Guide

This guide describes how to set up the development environment for **ocbot**.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   **Python 3.8+**
*   **curl**, **tar**, **patch** (standard Unix tools)

## Two Download Methods

ocbot supports two ways to get Chromium source code:

### Method 1: Tarball (Quick Start - Recommended for Beginners)

Download a pre-packaged tarball (~1-2GB). **Fast but incomplete** - suitable for quick testing but lacks third-party dependencies.

### Method 2: Depot Tools (Full Development - Recommended for Active Development)

Use Google's `depot_tools` to fetch the complete source tree (~30GB+) with all dependencies. **Required for full browser development**.

---

## Method 1: Tarball (Quick)

### Prerequisites

*   **curl**, **tar** (standard Unix tools)

### Download

```bash
./scripts/dev.py download --method tarball
```

This will:
*   Download Chromium source tarball (~1-2GB)
*   Extract to `build/src/`
*   Complete in ~10-30 minutes depending on network

**Pros:** Fast, simple  
**Cons:** Missing third-party dependencies, harder to update

---

## Method 2: Depot Tools (Full Development)

### Step 1: Install Depot Tools

Depot tools is Google's toolchain for Chromium development.

```bash
# Clone depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git

# Add to PATH (add this to your .bashrc or .zshrc)
export PATH="$PATH:/path/to/depot_tools"

# Verify installation
which fetch gclient gn ninja
```

**Reference:** [Chromium Depot Tools Tutorial](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html)

### Step 2: Download Source

```bash
# Full download with history (~30GB+)
./scripts/dev.py download --method depot

# Without git history (~15GB, faster)
./scripts/dev.py download --method depot --no-history

# Skip Android dependencies (smaller download)
./scripts/dev.py download --method depot --without-android
```

This will:
1. Run `fetch chromium` to get the base repository
2. Run `gclient sync` to download hundreds of third-party dependencies
3. Takes 1-3 hours depending on network speed

**If interrupted:** Simply re-run the command, it will resume automatically.

### Step 3: Sync Dependencies (Later)

To update dependencies or re-sync:

```bash
./scripts/dev.py download --method sync
```

---

## Project Structure

```text
ocbot/
├── docs/               # Documentation
├── resources/          # Project resources
│   ├── chromium_version.txt    # Chromium version
│   ├── patches/                # Chromium patches
│   └── ocbot-extension-example/# Example extension
├── scripts/            # Build scripts
│   ├── dev.py          # Main CLI utility
│   ├── download.py     # Download logic
│   ├── patch.py        # Apply patches
│   ├── build.py        # Build Chromium
│   └── common.py       # Utilities
└── extension/          # Chrome extension (WXT)
```

---

## Build Steps (Both Methods)

### 1. Download

Choose one method above.

### 2. Apply Patches

```bash
./scripts/dev.py patch
```

Applies patches from `resources/patches/series` to `build/src/`.

### 3. Build

```bash
./scripts/dev.py build
```

Default target is `chrome`. Build output goes to `build/src/out/Default/`.

**First build:** 2-4 hours (full compilation)  
**Incremental builds:** 10-30 minutes

---

## Platform-Specific Setup

### macOS

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install additional tools if needed
brew install curl tar python@3.11
```

### Linux (Ubuntu/Debian)

```bash
# Install system dependencies (run from src/ directory after download)
cd build/src
./build/install-build-deps.sh
```

### Windows

1. Install Visual Studio 2022 with:
   - "Desktop development with C++"
   - Windows SDK
   
2. Set environment variable:
   ```powershell
   setx DEPOT_TOOLS_WIN_TOOLCHAIN 0
   ```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| `depot_tools` not found | Add to PATH: `export PATH="$PATH:/path/to/depot_tools"` |
| `fetch` command not found | Run `gclient` once to initialize depot_tools |
| Download interrupted | Re-run the command, it resumes automatically |
| Patch failures | Check `build/src/` exists and version matches |
| Missing `gn` or `ninja` | Ensure depot_tools is in PATH |
| Build fails on Linux | Run `./build/install-build-deps.sh` in src/ |

---

## Quick Reference

```bash
# Quick download (tarball)
./scripts/dev.py download

# Full download (depot)
./scripts/dev.py download --method depot --no-history

# Re-sync dependencies
./scripts/dev.py download --method sync

# Apply patches
./scripts/dev.py patch

# Build
./scripts/dev.py build

# Build specific target
./scripts/dev.py build --target chrome
```

---

## Next Steps

1. [Extension Development](../extension/) - Build the Chrome extension
