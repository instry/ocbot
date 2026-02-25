# Plan-Driven Development

Ocbot follows a **Plan-Driven Development** workflow. 

We do **not** ask AI to write `.patch` files directly. Instead, AI reads the Plan, modifies the Chromium source code directly, and then we use tooling to generate the patches.

## Workflow

```
1. Requirement      →  Propose a new feature or change.
2. Plan             →  Create/Update `ocbot/plans/NN-feature-name.md`.
3. Implement        →  AI modifies `chromium/<version>/src/` directly.
4. Build & Verify   →  User runs `dev.py build` and tests the feature.
5. Local Commit     →  (Optional) Commit changes to Chromium's local git for history.
6. Generate Patches →  Run `python3 ocbot/scripts/dev.py update_patches`.
7. Commit Ocbot     →  Commit `patches/` and `plans/` to ocbot repo.
```

## Why Plan-Driven?

1.  **Context Retention**: Chromium is huge. Plans capture the "Why" and "Where" of a feature, which is lost in raw patch files.
2.  **AI Compatibility**: AI is better at "modifying this C++ file to add a button" than "writing a diff patch with correct context lines".
3.  **Upgrade Resilience**: When Chromium upgrades, patches break. Plans allow AI to re-implement the *logic* on the new version, even if file paths or APIs changed completely.

## The Role of AI

-   **Input**: The user's requirement + The Plan file (`ocbot/plans/X.md`).
-   **Action**: Directly edit files in `src/`.
-   **Output**: Modified source code (NOT patch files).

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

## Directory Structure

```
ocbot/
├── plans/                  ← The Source of Truth for Logic
│   ├── 00-branding.md
│   └── ...
├── patches/                ← The Storage Mechanism (Generated)
│   └── v144/
└── scripts/
    └── dev.py              ← The Tooling
```
