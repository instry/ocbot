# Development Guide

This guide describes how to set up the development environment for **ocbot**.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   **Python 3.8+**
*   **curl**, **tar**, **patch** (standard Unix tools)
*   **Depot Tools** (includes `gn`, `ninja`, `gclient`)
    *   Follow the [Chromium Depot Tools tutorial](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html) to install and add to your PATH.

## Project Structure

```text
ocbot/
├── docs/               # Documentation
├── resources/          # Project resources (version, patches)
│   ├── chromium_version.txt
│   └── patches/
└── scripts/            # Implementation scripts
    ├── dev.py          # Main development CLI utility
    ├── build.py
    ├── common.py
    ├── download.py
    └── patch.py
```

## Initialization Steps

We provide a `scripts/dev.py` utility to automate the setup process.

### 1. Download Chromium Source

Download the Chromium source code matching the version defined in `resources/chromium_version.txt`.

```bash
./scripts/dev.py download
```

This will:
*   Download the official Chromium source tarball.
*   Extract it to `build/src`.

### 2. Apply Patches

Apply the ungoogled-chromium patches and ocbot-specific modifications.

```bash
./scripts/dev.py patch
```

This will:
*   Read patches from `resources/patches/series`.
*   Apply them sequentially to the source tree in `build/src`.

### 3. Build

Generate build configuration and compile the browser.

```bash
./scripts/dev.py build
```

By default, this builds the `chrome` target.

## Common Issues

*   **Missing `gn` or `ninja`**: Ensure `depot_tools` is in your PATH.
*   **Patch Failures**: If patches fail to apply, check the logs. You may need to clean the `build/src` directory and re-download/re-patch.
