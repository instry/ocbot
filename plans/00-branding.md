# Plan: Branding — Chromium → Ocbot

## Goal

Replace Chromium default branding with Ocbot, including product name, company name, macOS Bundle ID, UI strings, icon assets, and macOS Keychain name.

## Changes

### 1. BRANDING File

**File:** `chrome/app/theme/chromium/BRANDING`

Line-by-line replacement:

| Field | Original | New |
|-------|----------|-----|
| COMPANY_FULLNAME | The Chromium Authors | The Ocbot Authors |
| COMPANY_SHORTNAME | The Chromium Authors | The Ocbot Authors |
| PRODUCT_FULLNAME | Chromium | Ocbot |
| PRODUCT_SHORTNAME | Chromium | Ocbot |
| PRODUCT_INSTALLER_FULLNAME | Chromium Installer | Ocbot Installer |
| PRODUCT_INSTALLER_SHORTNAME | Chromium Installer | Ocbot Installer |
| COPYRIGHT | Copyright ... The Chromium Authors | Copyright ... The Ocbot Authors |
| MAC_BUNDLE_ID | org.chromium.Chromium | oc.bot.app |
| MAC_CREATOR_CODE | Cr24 | oc24 |

### 2. UI String Replacement

In the following files, replace all "Chromium" with "OcBot" (note: UI uses "OcBot" capitalization):

**File:** `chrome/app/chromium_strings.grd`
- Product name (`IDS_PRODUCT_NAME`, `IDS_SHORT_PRODUCT_NAME`) → "OcBot"
- Product description, welcome text, first-run dialog, taskbar hints — all replaced
- Hundreds of replacements covering enterprise policies, download prompts, crash reports, incognito mode, etc.

**File:** `chrome/app/settings_chromium_strings.grdp`
- Settings page strings: about page, update status, password check, default browser, privacy settings, security settings, etc.
- All "Chromium" → "OcBot"

**File:** `components/components_chromium_strings.grd`
- Component-level strings: error pages, flags UI, crash reporting, version info, etc.
- All "Chromium" → "OcBot"

### 3. Icon Asset Replacement

All Chromium default icons replaced with Ocbot branded icons (direct file overwrite of PNG/ICO/ICNS files):

**macOS:**
- `chrome/app/theme/chromium/mac/app.icns`
- `chrome/app/theme/chromium/mac/AppIcon.icns`
- `chrome/app/theme/chromium/mac/Assets.car`
- `chrome/app/theme/chromium/mac/Assets.xcassets/AppIcon.appiconset/appicon_*.png` (7 sizes)
- `chrome/app/theme/chromium/mac/Assets.xcassets/Icon.iconset/icon_256x256*.png`

**Linux:**
- `chrome/app/theme/chromium/linux/product_logo_*.png` (multiple sizes + mono variant)

**Windows:**
- `chrome/app/theme/chromium/win/chromium.ico`, `chromium_doc.ico`, `chromium_pdf.ico`
- `chrome/app/theme/chromium/win/app_list.ico`, `incognito.ico`
- `chrome/app/theme/chromium/win/tiles/Logo.png`, `SmallLogo.png`

**Cross-platform:**
- `chrome/app/theme/chromium/product_logo_*.png` (16~1024, multiple sizes)
- `chrome/app/theme/default_100_percent/chromium/product_logo_*.png`
- `chrome/app/theme/default_100_percent/chromium/product_logo_name_22*.png`
- `chrome/app/theme/default_200_percent/chromium/product_logo_*.png`
- `chrome/app/theme/default_200_percent/chromium/product_logo_name_22*.png`
- `components/resources/default_100_percent/chromium/product_logo*.png`, `favicon_product.png`
- `components/resources/default_200_percent/chromium/product_logo*.png`, `favicon_product.png`

### 4. macOS Keychain Branding

**File:** `components/os_crypt/common/keychain_password_mac.mm`

In the `#else` (non-Google Chrome) branch, replace:
```cpp
// Original
const char kDefaultServiceName[] = "Chromium Safe Storage";
const char kDefaultAccountName[] = "Chromium";
// New
const char kDefaultServiceName[] = "Ocbot Safe Storage";
const char kDefaultAccountName[] = "Ocbot";
```

## Key Decisions

- Only modify files under `chromium/` directory, never touch `google_chrome/` (that's for Google Chrome)
- macOS Bundle ID set to `oc.bot.app` to avoid conflicts with Chromium/Chrome
- UI strings use "OcBot" (capital O and B), while BRANDING file uses "Ocbot"
- Icon files are direct overwrites (not patches) — the patch system automatically copies binary files

## Known Pitfalls

- BRANDING file format is `KEY=VALUE`, one per line, no quotes
- `@LASTCHANGE_YEAR@` is a build-time macro — leave it untouched
- Changing Keychain name means passwords stored by old versions won't auto-migrate (users need to re-authorize)
- `desc` attributes in `.grd` and `.grdp` files should also be updated for consistency (though they don't affect runtime)
- `chromium_strings.grd` is very large (hundreds of strings) — highest conflict probability when upgrading Chromium versions
