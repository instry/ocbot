
import os
import shutil
import subprocess
import sys
from pathlib import Path
from common import get_logger


def _sync_extension(logger, root_dir, out_dir):
    """Copy latest extension build into the app bundle or build output directory."""
    extension_src = root_dir / 'ocbot' / 'extension' / '.output' / 'chrome-mv3'
    if not extension_src.exists():
        logger.warning(f"Extension build output not found: {extension_src}")
        return

    if sys.platform == 'win32':
        # Windows: extension goes alongside the exe
        dest = out_dir / 'ocbot_extension'
    else:
        # macOS: extension goes into Framework Resources
        app_dir = out_dir / 'Ocbot.app'
        frameworks_dir = app_dir / 'Contents' / 'Frameworks'
        if not frameworks_dir.exists():
            return

        framework = None
        for item in frameworks_dir.iterdir():
            if item.name.endswith('.framework'):
                framework = item
                break

        if not framework:
            return

        dest = framework / 'Resources' / 'ocbot'

    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(extension_src, dest)
    logger.info(f"Extension synced to {dest}")

def run_chromium(args):
    logger = get_logger()

    # Detect source directory logic (duplicated from common/build but simplified)
    # We need to find src.
    # args.src_dir might be passed, or auto-detect.
    # common.py doesn't seem to have get_source_dir exposed easily or I can't see it.
    # I'll rely on relative paths for now or args.

    root_dir = Path(__file__).parent.parent.parent.resolve()
    # Try to find src
    src_dir = None
    if args.src_dir:
        src_dir = Path(args.src_dir)
    else:
        # Look for chromium/VERSION/src
        chromium_dir = root_dir / 'chromium'
        if chromium_dir.exists():
            # Find version dir
            for item in chromium_dir.iterdir():
                if item.is_dir() and (item / 'src').exists():
                    src_dir = item / 'src'
                    break

    if not src_dir:
        logger.error("Could not find source directory.")
        return

    out_dir_name = 'Official' if getattr(args, 'official', False) else 'Default'
    out_dir = src_dir / 'out' / out_dir_name

    # Platform-specific executable path
    if sys.platform == 'win32':
        executable = out_dir / 'ocbot.exe'
    else:
        executable = out_dir / 'Ocbot.app' / 'Contents' / 'MacOS' / 'Ocbot'

    if not executable.exists():
        if sys.platform == 'win32':
            logger.error(f"ocbot.exe not found at {executable}")
        else:
            logger.error(f"Ocbot.app not found at {executable.parent.parent}")
        logger.info("Please build first: python ocbot/scripts/dev.py build")
        return

    cmd = [str(executable)]

    # ocbot is loaded as a component extension from the Framework Resources dir.
    # Sync latest extension build into the app bundle before launching.
    _sync_extension(logger, root_dir, out_dir)

    # Dev mode: point component_loader to local extension build directly,
    # so hot-updated / bundled versions are skipped and OTA updater is disabled.
    extension_dev_path = root_dir / 'ocbot' / 'extension' / '.output' / 'chrome-mv3'
    if extension_dev_path.exists():
        cmd.append(f'--ocbot-extension-dir={extension_dev_path}')

    # User data dir
    user_data_dir = root_dir / 'chromium' / 'user_data'
    cmd.append(f'--user-data-dir={user_data_dir}')

    # macOS-only: fix cross-device link error
    if sys.platform == 'darwin':
        cmd.append('--disable-features=MacAppCodeSignClone,MacAppCodeSignCloneRenameAsBundle')

    # Pass through extra args
    if hasattr(args, 'args') and args.args:
        cmd.extend(args.args)

    logger.info(f"Launching Ocbot...")
    logger.info(f"Command: {' '.join(cmd)}")
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        pass
