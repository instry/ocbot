# 🛠️ Development Workflow

We follow a **Patch-Based Development** workflow. This ensures that our modifications are cleanly separated from the upstream Chromium source.

## 1. Develop & Verify
Modify source files in `chromium/src` directly. You can edit existing files or add new ones (including binary assets).

```bash
# ... make changes in chromium/src ...
./scripts/dev.py build      # Compile and verify
./scripts/dev.py run        # Run to test
```

## 2. Generate Patches
Once your changes are verified, use the `update_patches` command to automatically generate precise patches.

```bash
./scripts/dev.py update_patches
```

This command will:
*   **Scan** for all modified and untracked (new) files in `src`.
*   **Generate** `.patch` files for text changes (using `git diff HEAD`).
*   **Copy** binary files (images, archives, etc.) directly to `resources/patches`.
*   **Clean** old patches to ensure the `resources/patches` directory exactly matches your current state.

## 3. Commit
Commit the updated `resources/patches` directory to git.

```bash
git add resources/patches
git commit -m "feat: implement new feature X"
```

---

# 🌿 Branching Strategy

To maintain stability while rapidly iterating, we adopt a simplified Git Flow adapted for Chromium patch management.

## 1. Main Branch (`main`)
*   **Role**: The stable development branch.
*   **State**: Always buildable. Represents the latest set of patches compatible with the Chromium version defined in `resources/chromium_version.txt`.
*   **Rule**: Direct commits are allowed for maintainers, but PRs are preferred for significant changes.

## 2. Feature Branches (`feat/xxx`)
*   **Role**: For developing new features or significant refactors.
*   **Workflow**:
    1.  Create branch: `git checkout -b feat/my-feature`
    2.  Develop & Verify (see above).
    3.  Update patches: `./scripts/dev.py update_patches`
    4.  Commit & Push.
    5.  Submit Pull Request (PR) to `main`.

## 3. Upgrade Branches (`upgrade/chromium-xxx`)
*   **Role**: Dedicated branches for upgrading the upstream Chromium version.
*   **Why**: Upgrading Chromium is a complex process that may break existing patches.
*   **Workflow**:
    1.  Create branch: `git checkout -b upgrade/chromium-145`
    2.  Update `resources/chromium_version.txt`.
    3.  Run `./scripts/dev.py download` to fetch new source.
    4.  Run `./scripts/dev.py patch` and resolve conflicts manually.
    5.  Verify build and fix compilation errors.
    6.  Regenerate patches: `./scripts/dev.py update_patches`.
    7.  Merge back to `main` once stable.

## 4. Release Tags (`vX.Y.Z`)
*   **Role**: Immutable snapshots of stable releases.
*   **Format**: `v<Major>.<Minor>.<Patch>` (e.g., `v1.0.0`).
*   **Trigger**: Created from `main` when a milestone is reached.
