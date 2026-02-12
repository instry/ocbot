# ocbot Quick Start Guide

Welcome to ocbot! This is an AI-native Chromium browser project.

## 🚀 5-Minute Quick Start

### Method 1: Quick Experience (Recommended for Beginners)

Quickly download Chromium source using Tarball method:

```bash
# 1. Download source (approx. 20-40 mins)
./scripts/dev.py download --method tarball

# 2. Apply ocbot patches
./scripts/dev.py patch

# 3. View results
ls -la build/src/
```

### Method 2: Full Development (Recommended for Developers)

Get a full development environment using Depot Tools:

```bash
# 1. Install depot_tools (one-time)
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$(pwd)/depot_tools"

# 2. Download full source (approx. 1-3 hours)
./scripts/dev.py download --method depot --no-history

# 3. Apply patches
./scripts/dev.py patch

# 4. Build browser (first time 2-4 hours)
./scripts/dev.py build
```

---

## 🤔 Not sure which method to choose?

Run the check tool for an automatic recommendation:

```bash
./scripts/check-download.sh
```

It checks your disk space, network environment, and depot_tools installation status to give the best advice.

---

## 📊 Comparison of Methods

| Feature | Tarball | Depot Tools |
|---------|---------|-------------|
| Download Size | ~2GB | ~15-30GB |
| Time | 20-40 mins | 1-3 hours |
| Dependencies | ⚠️ Partial | ✅ Complete |
| Suitable For | Quick Experience | Deep Development |

**Detailed Comparison:** [download_methods.md](download_methods.md)

---

## 🎯 Common Commands

```bash
# Download
./scripts/dev.py download --method tarball              # Quick download
./scripts/dev.py download --method depot --no-history   # Full download

# Patch
./scripts/dev.py patch                                  # Apply all patches

# Build
./scripts/dev.py build                                  # Build chrome
./scripts/dev.py build --target content_shell           # Build test version

# Help
./scripts/dev.py --help
./scripts/dev.py download --help
```

---

## 📁 Project Structure

```
ocbot/
├── docs/                       # Documentation
│   ├── developing.md           # Development Guide
│   ├── DOWNLOAD_METHODS.md     # Download Methods Details
│   └── SIDEBAR_QUICK_GUIDE.md  # Sidebar Integration Guide
├── extension/                  # Chrome Extension (WXT + React)
├── resources/
│   ├── patches/                # Chromium C++ Patches
│   └── chromium_version.txt    # Chromium Version
├── scripts/                    # Build Scripts
│   └── dev.py                  # Main CLI Tool
└── build/                      # Build Directory (Created after download)
    └── src/                    # Chromium Source
```

---

## 🔧 Prerequisites

### Required (Both methods)

- Python 3.8+
- curl
- tar
- patch
- 60GB+ Disk Space

### Depot Tools Extra Requirements

- Git
- depot_tools
- 100GB+ Disk Space

### Platform Specific

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install curl python3 git

# Download and run (in build/src/ directory)
./build/install-build-deps.sh
```

---

## 🐛 FAQ

### Q: Download too slow/failed?

**Tarball Method:**
- Use resume transfer (curl supports automatically)
- Try lite version (auto fallback)

**Depot Tools Method:**
- Use `--no-history` to reduce size by half
- Configure proxy:
  ```bash
  export http_proxy=http://proxy:8080
  export https_proxy=http://proxy:8080
  ```

### Q: Not enough disk space?

```bash
# Check space
df -h .

# Clean build directory
rm -rf build/src/out/

# Or delete and re-download
rm -rf build/
```

### Q: Patch application failed?

```bash
# Check if versions match
cat resources/chromium_version.txt
cat build/src/chrome/VERSION

# Clean and retry
rm -rf build/src
./scripts/dev.py download
./scripts/dev.py patch
```

---

## 📚 Next Steps

- [Development Guide](developing.md) - Detailed development environment setup
- [Download Methods Details](download_methods.md) - Deep comparison of Tarball vs Depot Tools
- [Extension Development](../extension/) - WXT + React based Chrome extension

---

## 💡 Tips

1. **First time download?** Use `--method tarball` to quickly verify environment
2. **Planning to develop?** Install depot_tools, use `--method depot --no-history`
3. **Restricted network?** Tarball method is friendlier
4. **Tight disk space?** `--no-history` can save 50% space

---

**Need help?** Check detailed docs in this directory.
