# Plan-Driven Development

Ocbot is built on Chromium. When upgrading Chromium versions, code locations, API signatures, and file structures change frequently. `.patch` files break when line numbers shift, but the **intent and logic** of features remain stable.

Plan files capture the intent, change points, key code, and known pitfalls of each feature, enabling AI to re-implement features on any Chromium version.

## Workflow

```
1. Write Plan      →  ocbot/plans/NN-feature-name.md
2. Implement Code  →  Modify chromium src/
3. Build & Verify  →  python3 ocbot/scripts/dev.py build
4. Generate Patches →  python3 ocbot/scripts/dev.py update_patches
5. Commit          →  Plan + patches together
```

### Version Upgrade

```
1. Download new Chromium source
2. Try apply_patches, note which patches fail
3. Feed the failed patches' corresponding plans to AI:
   "Re-implement this feature on the new Chromium version based on this plan"
4. AI references the plan's intent and known pitfalls to find new injection points and APIs
5. After implementation, update the plan's "Known Pitfalls" with new API differences
6. Re-run update_patches
```

## Plan File Conventions

### Naming

`NN-feature-name.md` — number indicates implementation order (order matters when there are dependencies).

Current plan list:
- `00-branding.md` — Brand replacement (names, icons, strings)
- `01-toolbar-and-sidepanel.md` — Toolbar button & Side Panel UI
- `02-component-extension.md` — Component Extension loading
- `03-ota-updater.md` — Extension OTA hot update

### Template

```markdown
# Plan: [Feature Name]

## Goal

One or two sentences describing the feature goal from the user's perspective.

## Changes

### 1. [Change Title]

**File:** `path/to/file.cc`
(or **New file:** `path/to/new_file.cc`)

Describe the change intent, with key code snippets:

​```cpp
// Key code — no need for complete files, just show the logic
void DoSomething() {
  // ...
}
​```

### 2. [Next Change]
...

## Key Decisions

- Why approach A was chosen over approach B
- Architectural trade-offs

## Known Pitfalls

- API version differences (e.g., `base::Value::Dict` vs `base::DictValue`)
- Build dependency ordering
- Runtime edge cases to watch for
```

### Principles for Writing Plans

1. **Intent first**: Clearly state "what" before "how"
2. **Include key code**: No need for complete files, but core logic code snippets are essential — AI needs to know the specific API call patterns
3. **Record file paths**: Each change point must specify the file path — this is the key clue for AI to locate modification sites
4. **Record pitfalls**: "Known Pitfalls" is the most valuable section — record version-specific API differences, build issues, and runtime issues
5. **Keep updated**: If the plan turns out to be wrong during implementation, update the plan immediately

## Directory Structure

```
ocbot/
├── plans/
│   ├── plan_driven_dev.md          ← This file
│   ├── 00-branding.md
│   ├── 01-toolbar-and-sidepanel.md
│   ├── 02-component-extension.md
│   └── 03-ota-updater.md
├── patches/
│   └── v144/                       ← Patches for current version
│       ├── chrome/...
│       └── components/...
└── scripts/
    └── dev.py                      ← Dev tool entry point
        ├── build                   ← Compile
        ├── run                     ← Run (auto-passes --ocbot-extension-dir)
        ├── apply_patches           ← Apply patches to source
        ├── update_patches          ← Generate patches from source
        └── package                 ← Package DMG
```

## AI Instructions

When you (the AI) are asked to develop Ocbot features:

1. **Check plans first**: Look in `ocbot/plans/` for relevant plans
2. **Follow the plan**: The plan is the authoritative source of intent — code must conform to the plan's design
3. **Update the plan**: If the plan needs adjustment during implementation (API changed, approach infeasible), update the plan immediately
4. **Record pitfalls**: Write build errors, API incompatibilities, etc. into "Known Pitfalls"
