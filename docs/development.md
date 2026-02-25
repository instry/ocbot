# Development Workflow

Ocbot follows a **Plan-Driven Development** workflow. 

For the complete workflow, philosophy, and AI guidelines, please strictly refer to **[Plan-Driven Development](plan-driven-dev.md)**.

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
2.  Follow the [Plan-Driven Workflow](plan-driven-dev.md#workflow).

### `upgrade/chromium-xxx`
Chromium version upgrade:
1.  Download new Chromium source.
2.  `./scripts/dev.py patch` (many will fail).
3.  **AI Re-implementation**: Feed failed patches' plans to AI: "Re-implement this on new Chromium".
4.  AI modifies source directly.
5.  Build -> Test -> Fix.
6.  `./scripts/dev.py update_patches` (generates new clean patches for the new version).
7.  Update Plans with new API pitfalls.
