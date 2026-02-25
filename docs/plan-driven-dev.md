# Plan-Driven Development

Ocbot follows a **Plan-Driven Development** workflow. 

## Workflow

```
1. Requirement      →  Propose a new feature or change.
2. Plan             →  Create/Update `ocbot/plans/NN-feature-name.md`.
3. Implement        →  AI modifies `chromium/<version>/src/` directly.
4. Build & Verify   →  Run `dev.py build`. AI fixes build errors until success.
5. Reflect & Update →  **After build succeeds**, AI updates Plan to match actual implementation.
6. Local Commit     →  (Optional) Commit changes to Chromium's local git for history.
7. Generate Patches →  Run `python3 ocbot/scripts/dev.py update_patches`.
8. Commit Ocbot     →  Commit `patches/` and `plans/` to ocbot repo.
```

## Why Plan-Driven?

1.  **Context Retention**: Chromium is huge. Plans capture the "Why" and "Where" of a feature, which is lost in raw patch files.
2.  **AI Compatibility**: AI is better at "modifying this C++ file to add a button" than "writing a diff patch with correct context lines".
3.  **Upgrade Resilience**: When Chromium upgrades, patches break. Plans allow AI to re-implement the *logic* on the new version, even if file paths or APIs changed completely.

## The Role of AI

-   **Input**: The user's requirement + The Plan file (`ocbot/plans/X.md`).
-   **Action**: Directly edit files in `src/`.
-   **Validation**: **MUST** run build (`dev.py build`) and fix any compilation errors.
-   **Reflection**: **Only after build succeeds**, check if the `ocbot/plans/X.md` needs to be updated to reflect the actual implementation.
-   **Output**: Modified source code (NOT patch files) AND updated Plan file.

*Note: Patch files are purely a storage mechanism, generated automatically by `dev.py update_patches`.*

## Plan File Conventions

### Naming

`NN-feature-name.md` — number indicates implementation order.

### Template

```markdown
# Plan: [Feature Name]

## Goal

One or two sentences describing the feature goal.

## Implementation Details

### 1. [Change Title]

**Target:** `path/to/file.cc`

**Logic:**
Describe what needs to be changed.

```cpp
// Key code snippet
void DoSomething() {
  // ...
}
```

## Key Decisions

- Why approach A over B?

## Known Pitfalls

- API version differences.
- Build dependency issues.
```

## Prerequisites

- macOS / Linux (Windows untested)
- Python 3
- Node.js + npm (for extension build)
- [Depot Tools](https://chromium.googlesource.com/chromium/tools/depot_tools.git) (for full build)

## Getting Started

```bash
# 1. Check your environment
./scripts/dev.py check

# 2. Download Chromium source
./scripts/dev.py download                          # Quick tarball (code review only)
./scripts/dev.py download --method depot --no-history  # Full source (for building)

# 3. Apply existing patches to get the current ocbot state
./scripts/dev.py patch
```

After `patch`, the Chromium source tree at `chromium/<version>/src/` contains all ocbot modifications and is ready for development.

## Commands Reference

```bash
# Download
python scripts/dev.py download --method tarball                 # Quick download
python scripts/dev.py download --method depot --no-history      # Full download

# Patch
python scripts/dev.py patch                                  # Apply all patches

# Update Patches
python scripts/dev.py update_patches                         # Generate patches from source

# Build
python scripts/dev.py build                                  # Build Browser

# Run
python scripts/dev.py run                                    # Run with extension loaded

# Package
python scripts/dev.py package                                # Package into DMG

# Help
python scripts/dev.py --help
```

| Command | Description |
|---------|-------------|
| `check` | Check environment, recommend download method |
| `download` | Download Chromium source (`--method tarball\|depot\|sync`) |
| `patch` | Apply all patches to source (sync state) |
| `reset` | Revert all patches (clean source) |
| `update_patches` | Generate patches from modified source |
| `build` | Build Ocbot (`--official`, `--clean`, `--target`) |
| `run` | Run Ocbot (`--official`) |
| `package` | Package into DMG (`--sign`, `--notarize`) |

## Branching Strategy

### `main`
Stable development branch. `ocbot/patches/` always reflects a buildable state.

### `feat/xxx`
Feature branches.
1.  `git checkout -b feat/my-feature`
2.  Follow the [Workflow](#workflow).

### `upgrade/chromium-xxx`
Chromium version upgrade:
1.  Download new Chromium source.
2.  `./scripts/dev.py patch` (many will fail).
3.  **AI Re-implementation**: Feed failed patches' plans to AI: "Re-implement this on new Chromium".
4.  AI modifies source directly.
5.  Build -> Test -> Fix.
6.  `./scripts/dev.py update_patches` (generates new clean patches for the new version).
7.  Update Plans with new API pitfalls.

## Project Structure

```
ocbot/
├── docs/                       # Documentation
├── plans/                      # Feature plans (The Source of Truth for Logic)
│   ├── 00-branding.md
│   └── ...
├── extension/                  # Chrome Extension (WXT + React)
├── patches/                    # The Storage Mechanism (Generated)
│   └── v144/                   # Chromium patches for current version
├── scripts/                    # Build Scripts
│   └── dev.py                  # Main CLI Tool
│
chromium/                       # Chromium Source Directory
└── <version>/src/              # Patched source tree
```
