# Development Workflow

We follow a **Patch-Based Development** workflow. All Chromium modifications live as patch files in `patches/v<version>/`, cleanly separated from upstream source.

For AI-assisted development and Chromium version upgrades, see [Plan-Driven Development](plan-driven-dev.md).

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

# 3. Apply patches to get the latest ocbot code
./scripts/dev.py patch
```

After `patch`, the Chromium source tree at `chromium/<version>/src/` contains all ocbot modifications and is ready for development.

## Development Cycle

```
1. Apply patches    →  ./scripts/dev.py patch
2. Edit source      →  Modify files in chromium/<version>/src/
3. Build            →  ./scripts/dev.py build
4. Test             →  ./scripts/dev.py run
5. Iterate          →  Repeat 2-4 until satisfied
6. Update patches   →  ./scripts/dev.py update_patches
7. Commit & PR      →  git add patches/ && git commit && git push
```

### Step by step

**1. Apply patches**

```bash
./scripts/dev.py patch
```

Applies all patches from `patches/v<version>/` to the Chromium source tree. This is your starting point — after this, `src/` reflects the current state of ocbot.

**2. Edit source code**

Work directly in `chromium/<version>/src/`. Edit existing files or add new ones. The [plan files](../plans/) document every modification and its intent.

**3. Build**

```bash
./scripts/dev.py build              # Debug build
./scripts/dev.py build --official   # Release build (optimized)
./scripts/dev.py build --clean      # Clean build
```

The build command also:
- Installs icon assets from `icons/` to the source tree
- Builds the extension (`npm run build` + `npm run zip` in `extension/`)
- Compiles Chromium with `autoninja`

**4. Run & test**

```bash
./scripts/dev.py run                # Run debug build
./scripts/dev.py run --official     # Run release build
```

In dev mode, `run` automatically passes `--ocbot-extension-dir` pointing to the local extension build output, so extension changes are reflected immediately without rebuilding Chromium.

**5. Update patches**

```bash
./scripts/dev.py update_patches
```

Scans the source tree for all changes compared to pristine Chromium:
- Generates `.patch` files for text modifications (via `git diff`)
- Copies binary files (images, icons) directly to `patches/`
- Cleans stale patches that no longer correspond to any change

**6. Commit**

```bash
cd ocbot
git add patches/ plans/
git commit -m "feat: describe your change"
```

Always commit `patches/` and `plans/` together. If you added a new feature, create or update the corresponding [plan file](../plans/).

### Reverting patches

```bash
./scripts/dev.py reset
```

Reverts all ocbot modifications, restoring the source tree to pristine Chromium state.

## Commands Reference

| Command | Description |
|---------|-------------|
| `check` | Check environment, recommend download method |
| `download` | Download Chromium source (`--method tarball\|depot\|sync`) |
| `patch` | Apply all patches to source |
| `reset` | Revert all patches (clean source) |
| `update_patches` | Generate patches from modified source |
| `build` | Build Ocbot (`--official`, `--clean`, `--target`) |
| `run` | Run Ocbot (`--official`) |
| `package` | Package into DMG (`--sign`, `--notarize`) |
| `release-extension` | Release extension to GitHub |

All commands accept `--src-dir` to override the source directory.

## Branching Strategy

### `main`
Stable development branch. Always buildable. Patches are compatible with the Chromium version in `patches/v<version>/chromium_version.txt`.

### `feat/xxx`
Feature branches. Workflow:
1. `git checkout -b feat/my-feature`
2. `./scripts/dev.py patch` → edit → build → test
3. `./scripts/dev.py update_patches`
4. Commit and submit PR to `main`

### `upgrade/chromium-xxx`
Chromium version upgrade branches:
1. `git checkout -b upgrade/chromium-145`
2. Download new Chromium source
3. `./scripts/dev.py patch` — note which patches fail
4. For failed patches, refer to [plan files](../plans/) and re-implement
5. Build, test, fix
6. `./scripts/dev.py update_patches`
7. Update plan files with new API differences in "Known Pitfalls"
8. Merge to `main`

### Release tags (`vX.Y.Z`)
Immutable snapshots of stable releases, created from `main`.
