import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root, get_agent_root


def _sync_extension(logger, out_dir):
    """Copy latest extension build into the app bundle or build output directory."""
    extension_src = get_agent_root() / '.output' / 'chrome-mv3'
    if not extension_src.exists():
        logger.warning(f"Extension build output not found: {extension_src}")
        return

    if sys.platform == 'win32':
        # Windows: DIR_RESOURCES resolves to <exe_dir>/resources/
        dest = out_dir / 'resources' / 'ocbot'
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

    root_dir = get_project_root()
    src_dir = Path(args.src_dir) if args.src_dir else get_source_dir()

    if not src_dir:
        logger.error("Could not find source directory.")
        return

    out_dir_name = 'Official' if getattr(args, 'official', False) else 'Default'
    out_dir = src_dir / 'out' / out_dir_name

    # Platform-specific executable path
    if sys.platform == 'win32':
        executable = out_dir / 'ocbot.exe'
        if not executable.exists():
             executable = out_dir / 'chrome.exe'
    else:
        executable = out_dir / 'Ocbot.app' / 'Contents' / 'MacOS' / 'Ocbot'
        if not executable.exists():
             # Fallback to Chromium/Google Chrome for macOS if Ocbot.app is missing
             # (Though usually on macOS we build the app bundle)
             pass

    if not executable.exists():
        if sys.platform == 'win32':
            logger.error(f"Executable not found at {out_dir / 'ocbot.exe'} or {out_dir / 'chrome.exe'}")
        else:
            logger.error(f"Ocbot.app not found at {out_dir / 'Ocbot.app'}")
        logger.info("Please build first: python ocbot/scripts/dev.py build")
        return

    cmd = [str(executable)]

    # ocbot is loaded as a component extension from the Framework Resources dir.
    # Sync latest extension build into the app bundle before launching.
    _sync_extension(logger, out_dir)

    # Dev mode: point component_loader to local extension build directly,
    # so hot-updated / bundled versions are skipped and OTA updater is disabled.
    extension_dev_path = get_agent_root() / '.output' / 'chrome-mv3'
    if extension_dev_path.exists():
        cmd.append(f'--ocbot-extension-dir={extension_dev_path}')

    # Pass through extra args
    if hasattr(args, 'args') and args.args:
        cmd.extend(args.args)

    # Check if --user-data-dir is already provided
    has_user_data_dir = False
    for arg in cmd:
        if arg.startswith('--user-data-dir'):
            has_user_data_dir = True
            break
    
    if not has_user_data_dir:
        # Default to a dev profile in temp directory to avoid conflicts with stable installation
        dev_profile = Path(tempfile.gettempdir()) / "ocbot-dev-profile"
        dev_profile.mkdir(parents=True, exist_ok=True)
        cmd.append(f"--user-data-dir={dev_profile}")
        logger.info(f"Using dev profile: {dev_profile}")

    logger.info(f"Launching Ocbot...")
    logger.info(f"Command: {' '.join(cmd)}")
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        pass
