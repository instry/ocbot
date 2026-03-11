import os
import shutil
import subprocess
import sys
from pathlib import Path
from common import get_logger, get_chromium_root, get_main_repo, get_source_dir, get_chromium_version


def check_depot_tools():
    """Check if depot_tools is available in PATH"""
    return shutil.which('fetch') is not None and shutil.which('gclient') is not None


def init_depot_tools():
    """Initialize depot_tools by running gclient once"""
    logger = get_logger()

    if not check_depot_tools():
        logger.error("depot_tools not found in PATH!")
        logger.info("Please install depot_tools first:")
        logger.info("  git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git")
        logger.info("  export PATH=\"$PATH:/path/to/depot_tools\"")
        return False

    try:
        result = subprocess.run(['gclient', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info(f"depot_tools is ready ({result.stdout.strip()})")
            return True
    except Exception:
        pass

    logger.info("Initializing depot_tools...")
    try:
        result = subprocess.run(['gclient'], capture_output=True, text=True)
        if result.returncode == 0 or 'Usage:' in result.stderr:
            logger.info("depot_tools initialized successfully")
            return True
    except Exception as e:
        logger.error(f"Failed to initialize depot_tools: {e}")

    return False


def init_chromium(args):
    """First-time setup: fetch chromium into chromium/main/"""
    logger = get_logger()

    if not init_depot_tools():
        return False

    main_dir = get_main_repo()
    main_src = main_dir / 'src'

    # Check if already fetched
    if main_src.exists() and (main_src / '.git').exists():
        logger.info("Chromium already fetched in main/. Running gclient sync...")
        os.chdir(main_dir)
        result = subprocess.run(['gclient', 'sync'], check=False)
        if result.returncode != 0:
            logger.error("gclient sync failed")
            return False
        logger.info("Sync complete.")
        return True

    logger.info("Fetching Chromium source into chromium/main/...")
    logger.info("This will take a while (30GB+ source + dependencies)...")

    main_dir.mkdir(parents=True, exist_ok=True)
    os.chdir(main_dir)

    # Check if .gclient already exists (partial fetch)
    if (main_dir / '.gclient').exists():
        logger.warning("Found existing .gclient. Resuming with gclient sync...")
    else:
        fetch_cmd = ['fetch', '--nohooks', 'chromium']
        if getattr(args, 'no_history', False):
            fetch_cmd.insert(1, '--no-history')
            logger.info("Using --no-history to reduce download size")

        logger.info(f"Running: {' '.join(fetch_cmd)}")
        try:
            result = subprocess.run(fetch_cmd, check=False)
            if result.returncode != 0:
                logger.warning("fetch returned non-zero. Attempting gclient sync to resume...")
        except Exception as e:
            logger.error(f"fetch failed: {e}")
            return False

    # Verify .gclient or src/ exists before syncing
    if not (main_dir / '.gclient').exists() and not main_src.exists():
        logger.error("No .gclient or src/ found after fetch. Something went wrong.")
        return False

    logger.info("Running gclient sync...")
    result = subprocess.run(['gclient', 'sync'], check=False)
    if result.returncode != 0:
        logger.error("gclient sync failed")
        return False

    logger.info(f"Chromium source ready at: {main_src}")
    return True


def create_worktree(args):
    """Create a git worktree for a specific Chromium version."""
    logger = get_logger()

    version = getattr(args, 'version', None) or get_chromium_version()
    if not version:
        logger.error("Could not determine version. Please specify --version.")
        return False

    major = version.split('.')[0]
    main_src = get_main_repo() / 'src'

    if not main_src.exists() or not (main_src / '.git').exists():
        logger.error("Main repo not found. Run 'dev.py init' first.")
        return False

    wt_root = get_chromium_root() / f'v{major}'
    wt_src = wt_root / 'src'

    if wt_src.exists():
        logger.info(f"Worktree v{major} already exists at {wt_src}")
        return True

    # Fetch tags
    logger.info("Fetching tags...")
    subprocess.run(['git', 'fetch', '--tags'], cwd=main_src, check=False)

    # Verify the tag exists
    tag_found = False
    for tag in [version, f"refs/tags/{version}"]:
        result = subprocess.run(
            ['git', 'rev-parse', '--verify', tag],
            cwd=main_src, capture_output=True, text=True
        )
        if result.returncode == 0:
            tag_found = True
            break

    if not tag_found:
        logger.error(f"Tag {version} not found. Fetch may not have included it.")
        return False

    # Create worktree directory
    wt_root.mkdir(parents=True, exist_ok=True)

    # Create git worktree
    logger.info(f"Creating worktree at {wt_src} from tag {version}...")
    result = subprocess.run(
        ['git', 'worktree', 'add', str(wt_src), version],
        cwd=main_src, capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.error(f"Failed to create worktree: {result.stderr}")
        return False

    # Create base branch explicitly for reference
    base_branch = f"base_{version}"
    logger.info(f"Creating base branch {base_branch} for reference...")
    subprocess.run(
        ['git', 'branch', base_branch, version],
        cwd=wt_src, check=False
    )

    # Create development branch
    branch_name = f"ocbot_v{major}"
    logger.info(f"Creating branch {branch_name}...")
    result = subprocess.run(
        ['git', 'checkout', '-b', branch_name],
        cwd=wt_src, capture_output=True, text=True
    )
    if result.returncode != 0:
        # Branch may already exist
        logger.warning(f"Could not create branch {branch_name}: {result.stderr.strip()}")
        subprocess.run(['git', 'checkout', branch_name], cwd=wt_src, check=False)

    # Generate .gclient for this worktree
    gclient_content = f"""solutions = [{{
  "name": "src",
  "url": "https://chromium.googlesource.com/chromium/src.git@{version}",
  "managed": False,
  "custom_deps": {{}},
  "custom_vars": {{}},
}}]
"""
    gclient_path = wt_root / '.gclient'
    gclient_path.write_text(gclient_content)
    logger.info(f"Generated {gclient_path}")

    # Run gclient sync
    logger.info("Running gclient sync --nohooks for worktree...")
    os.chdir(wt_root)
    result = subprocess.run(['gclient', 'sync', '--nohooks'], check=False)
    if result.returncode != 0:
        logger.warning("gclient sync --nohooks returned non-zero. Dependencies may be incomplete.")

    logger.info(f"Worktree v{major} created at {wt_src}")
    return True


def list_worktrees(args):
    """List all version worktrees."""
    logger = get_logger()

    main_src = get_main_repo() / 'src'
    chromium_root = get_chromium_root()

    print("Version worktrees:")
    print("-" * 60)

    # Use git worktree list if main repo exists
    if main_src.exists() and (main_src / '.git').exists():
        result = subprocess.run(
            ['git', 'worktree', 'list'],
            cwd=main_src, capture_output=True, text=True
        )
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                print(f"  {line}")
            print()

    # Also scan for v* directories
    if chromium_root.exists():
        found = False
        for d in sorted(chromium_root.iterdir()):
            if d.is_dir() and d.name.startswith('v') and d.name[1:].isdigit():
                src = d / 'src'
                has_gclient = (d / '.gclient').exists()
                has_src = src.exists()
                status = "ok" if (has_gclient and has_src) else "incomplete"
                print(f"  {d.name}: {d}  [{status}]")
                found = True
        if not found:
            print("  (no version worktrees found)")
    else:
        print("  (chromium directory not found)")


def remove_worktree(args):
    """Remove a version worktree."""
    logger = get_logger()

    major = args.major
    if not major:
        logger.error("Please specify the major version to remove (e.g. 144)")
        return False

    main_src = get_main_repo() / 'src'
    wt_root = get_chromium_root() / f'v{major}'
    wt_src = wt_root / 'src'

    if not wt_root.exists():
        logger.error(f"Worktree directory v{major} not found.")
        return False

    # Remove git worktree
    if main_src.exists() and (main_src / '.git').exists():
        logger.info(f"Removing git worktree v{major}/src...")
        result = subprocess.run(
            ['git', 'worktree', 'remove', '--force', str(wt_src)],
            cwd=main_src, capture_output=True, text=True
        )
        if result.returncode != 0:
            logger.warning(f"git worktree remove failed: {result.stderr.strip()}")
            logger.info("Falling back to manual cleanup...")

    # Remove the directory
    if wt_root.exists():
        logger.info(f"Removing directory {wt_root}...")
        shutil.rmtree(wt_root)

    logger.info(f"Worktree v{major} removed.")
    return True


def sync_worktree(args):
    """Run gclient sync for a version worktree."""
    logger = get_logger()

    version = getattr(args, 'version', None) or get_chromium_version()
    if version:
        major = version.split('.')[0]
        wt_root = get_chromium_root() / f'v{major}'
    else:
        # Try main
        wt_root = get_main_repo()

    if not wt_root.exists():
        logger.error(f"Directory not found: {wt_root}")
        return False

    if not (wt_root / '.gclient').exists() and not (wt_root / 'src').exists():
        logger.error(f"No .gclient or src/ found in {wt_root}")
        return False

    logger.info(f"Running gclient sync in {wt_root}...")
    os.chdir(wt_root)
    result = subprocess.run(['gclient', 'sync'], check=False)
    if result.returncode != 0:
        logger.error("gclient sync failed")
        return False

    logger.info("Sync complete.")
    return True
