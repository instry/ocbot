# ocbot - AI Browser & Assistant

## **[https://oc.bot](https://oc.bot)**

---

**ocbot** is an AI browser & assistant. You can think of it as an open-source version of **Chrome + Gemini**, and an all-in-one version of **OpenClaw**.

---

## ✨ Key Features

### 1. AI Browser
*   **Open Source Chrome + Gemini**: AI capabilities are deeply integrated into the browser kernel, not just as a plugin.
*   **Freedom of Choice**: Freely switch between Large Language Models (LLMs). Supports mainstream cloud models as well as fully **local LLMs**, ensuring data privacy and control.
*   **Chrome Lossless Experience**: Retains the full Chrome experience. Easily import your Chrome data (bookmarks, history, passwords) and continue browsing without interruption.

### 2. AI Assistant
*   **OpenClaw-like Experience**: ocbot runs not only on your desktop but can also be interacted with remotely via mobile browsers or third-party IM apps.
*   **Always On**: Command your home browser to handle complex tasks remotely, wherever you are.
*   **Mobile Version**: Access ocbot on iOS/Android with a native Chrome-like experience. Sync your tabs and history seamlessly across devices.

### 3. RPA Killer
Achieve web automation with natural language—no coding required:
*   **Natural Language Control**: Simply tell the browser "Download all invoices" or "Monitor flight prices".
*   **Learn Once, Reuse Often**: After learning an operation flow once, AI converts it into an efficient execution path, **significantly saving Token costs** for future runs.
*   **Self-Healing**: Web UI changed? The AI uses visual understanding to automatically repair operation paths, ensuring continuous stable operation.

---

## 🚀 Quick Start

### Option 1: Quick View (Tarball)
*For code preview only (Fast, ~20 mins).*
```bash
./scripts/dev.py download --method tarball
./scripts/dev.py patch
```

### Option 2: Full Development (Depot Tools)
*For building and contributing (Slow, ~2 hours).*
```bash
# 1. Setup Depot Tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$(pwd)/depot_tools"

# 2. Download & Build
./scripts/dev.py download --method depot --no-history
./scripts/dev.py patch
./scripts/dev.py build
./scripts/dev.py run
```

> **Tip:** Run `./scripts/dev.py check` for auto-recommendation.

---

## 🎯 Common Commands

```bash
# Download
./scripts/dev.py download --method tarball                 # Quick download
./scripts/dev.py download --method depot --no-history      # Full download

# Patch
./scripts/dev.py patch                                  # Apply all patches

# Build
./scripts/dev.py build                                  # Build Browser

# Run
./scripts/dev.py run                                    # Run with extension loaded

# Help
./scripts/dev.py --help
./scripts/dev.py download --help
```

---

## 📁 Project Structure

```
ocbot/
├── docs/                       # Documentation (Merged into README)
├── extension/                  # Chrome Extension (WXT + React)
├── resources/
│   ├── patches/                # Chromium C++ Patches
│   └── chromium_version.txt    # Chromium Version
├── scripts/                    # Build Scripts
    └── dev.py                  # Main CLI Tool

chromium/                       # Chromium Source Directory
    └── <version>/              # Specific Version
```

---

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
