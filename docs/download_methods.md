# Comparison of Chromium Source Code Download Methods

ocbot provides two ways to download Chromium source code, suitable for different scenarios.

## Quick Comparison

| Feature | Tarball (Archive) | Depot Tools (Full Dev) |
|---------|-------------------|------------------------|
| **Download Size** | ~1-2GB | ~30GB+ (Full) / ~15GB (No History) |
| **Download Time** | 10-30 mins | 1-3 hours |
| **Dependency Integrity** | ❌ Missing third-party libs | ✅ Contains all dependencies |
| **Git History** | ❌ None | ✅ Optional |
| **Code Update** | ❌ Requires redownload | ✅ `gclient sync` incremental update |
| **Suitable Scenario** | Quick test, CI/CD | Deep dev, patch modification |
| **Build Capability** | ⚠️ May fail | ✅ Full support |

---

## Tarball Method (Quick Start)

### How it Works

Directly download the source code archive released by Google:

```
https://commondatastorage.googleapis.com/chromium-browser-official/
└── chromium-{version}.tar.xz
```

### Scenarios

- ✅ Quick experience with ocbot patch system
- ✅ CI/CD automated build (with pre-compiled dependencies)
- ✅ Just viewing source code, not modifying
- ✅ Network environment cannot use depot_tools

### Pros & Cons

**Pros:**
- Fast download (1-2GB vs 30GB)
- No depot_tools required
- Single file, easy to backup

**Cons:**
- ❌ **Missing third-party dependencies** (Libraries defined in DEPS)
- ❌ Cannot use `gclient sync` to update
- ❌ No Git history, cannot view commit logs
- ❌ Some build targets may fail

### Commands

```bash
# Basic download
./scripts/dev.py download --method tarball

# Specify version
./scripts/dev.py download --method tarball --version 144.0.7559.132
```

---

## Depot Tools Method (Full Development)

### How it Works

Use Google's official development toolchain:

1. **`fetch chromium`** - Clone base repository (~5GB)
2. **`gclient sync`** - Sync third-party dependencies (~25GB)

### Scenarios

- ✅ Developing ocbot features
- ✅ Modifying Chromium source code
- ✅ Debugging Chromium internals
- ✅ Keeping code updated

### Pros & Cons

**Pros:**
- ✅ **Complete development environment**
- ✅ All third-party dependencies synced automatically
- ✅ Supports `gclient sync` incremental updates
- ✅ Complete Git history
- ✅ Can use `git bisect` for debugging

**Cons:**
- Slow download (30GB+)
- Requires depot_tools
- Complex initial setup

### Commands

```bash
# 1. Install depot_tools first
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$(pwd)/depot_tools"

# 2. Download full source (Recommended)
./scripts/dev.py download --method depot

# 3. Without Git history (Save space)
./scripts/dev.py download --method depot --no-history

# 4. Skip Android dependencies (Desktop dev only)
./scripts/dev.py download --method depot --without-android

# 5. Subsequent sync update
./scripts/dev.py download --method sync
```

---

## Detailed Process Comparison

### Tarball Process

```bash
# 1. Download (10-30 mins)
curl -o build/chromium-144.0.7559.132.tar.xz \
  https://commondatastorage.googleapis.com/.../chromium-144.0.7559.132.tar.xz

# 2. Extract (5-10 mins)
tar -xf build/chromium-144.0.7559.132.tar.xz -C build/
mv build/chromium-144.0.7559.132 build/src

# Total: ~20-40 mins
```

**Result:**
```
build/src/
├── chrome/          ✓
├── content/         ✓
├── extensions/      ✓
└── third_party/     ⚠️ Incomplete
```

### Depot Tools Process

```bash
# 1. Get base repo (20-40 mins)
fetch --nohooks chromium

# 2. Sync dependencies (1-2 hours)
gclient sync

# Total: 1-3 hours
```

**Result:**
```
build/src/
├── .git/            ✓ Full history
├── chrome/          ✓
├── content/         ✓
├── extensions/      ✓
├── third_party/     ✓ Complete (100+ deps)
│   ├── blink/
│   ├── v8/
│   ├── skia/
│   └── ...
└── DEPS             ✓ Dependency config
```

---

## Decision Guide

### Choose Tarball If:

- [ ] Just checking ocbot patch effects
- [ ] Network conditions prevent using depot_tools
- [ ] Limited disk space (< 50GB)
- [ ] No code modification needed

### Choose Depot Tools If:

- [ ] Planning to develop ocbot features
- [ ] Need to modify Chromium source code
- [ ] Need to debug browser internals
- [ ] Want to keep code updated
- [ ] Sufficient disk space (> 100GB)

---

## Mixed Strategy

Recommended progressive strategy for ocbot development:

### Phase 1: Evaluation (Tarball)

```bash
# Quick download, verify patch system
./scripts/dev.py download --method tarball
./scripts/dev.py patch
# Check if patches applied correctly
```

### Phase 2: Development (Depot Tools)

```bash
# Remove tarball, use full environment
rm -rf build/
./scripts/dev.py download --method depot --no-history
./scripts/dev.py patch
./scripts/dev.py build
```

### Phase 3: Maintenance (Sync)

```bash
# Regularly sync Chromium updates
./scripts/dev.py download --method sync
./scripts/dev.py patch  # May need to re-apply patches
```

---

## Disk Space Planning

| Phase | Tarball | Depot Tools |
|-------|---------|-------------|
| Package | 2GB | 0GB (Direct clone) |
| Source | 10GB | 30GB |
| Build Artifacts | 50-100GB | 50-100GB |
| **Total** | **60-110GB** | **80-130GB** |

**Recommendation:** Prepare 150GB+ free space

---

## Network Notes

### Tarball

- Single large file download
- Supports resume (curl)
- Can use mirror acceleration

### Depot Tools

- Many small files (Git + DEPS)
- Automatic resume (gclient)
- Requires access to Google servers (may need proxy)

**Proxy Setup:**

```bash
# HTTP Proxy
export http_proxy=http://proxy.example.com:8080
export https_proxy=http://proxy.example.com:8080

# Or use .gitcookies auth
git config --global http.cookiefile ~/.gitcookies
```

---

## FAQ

### Q: What dependencies are missing in Tarball?

A: Mainly libraries under `third_party/`:
- Blink engine
- V8 JavaScript engine
- Skia graphics library
- Various codecs, fonts, etc.

### Q: Can I switch from Tarball to Depot Tools?

A: **No**. You need to delete `build/` directory and start over:

```bash
rm -rf build/
./scripts/dev.py download --method depot
```

### Q: What if Depot Tools download is too slow?

A:
1. Use `--no-history` to reduce size by half
2. Use `--without-android` to skip Android code
3. Configure proxy or mirror
4. Use `--jobs 4` to limit parallelism (if network is unstable)

### Q: How to check if download is successful?

A:

**Tarball:**
```bash
ls -lh build/src/chrome/  # Should have content
ls build/src/third_party/v8/  # May not exist
```

**Depot Tools:**
```bash
cd build/src
git log --oneline -5  # Should have Git history
gclient revinfo  # Show dependency versions
```

---

## Related Docs

- [Depot Tools Official Docs](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html)
- [Chromium Build Instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)
- [ocbot Development Guide](developing.md)
