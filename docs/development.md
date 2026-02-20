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
