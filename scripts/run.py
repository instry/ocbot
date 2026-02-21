
import os
import subprocess
import sys
from pathlib import Path
from common import get_logger

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
        logger.error("Could not find Chromium source directory.")
        return

    out_dir = src_dir / 'out' / 'Default'
    
    # Check for Ocbot.app first (branding applied)
    executable = out_dir / 'Ocbot.app' / 'Contents' / 'MacOS' / 'Ocbot'
    if not executable.exists():
        # Fallback to Chromium.app
        executable = out_dir / 'Chromium.app' / 'Contents' / 'MacOS' / 'Chromium'
    
    if not executable.exists():
        logger.error(f"Executable not found at {executable} or Ocbot.app")
        logger.info("Please build Chromium first: python3 ocbot/scripts/dev.py build")
        return

    cmd = [str(executable)]

    # ocbot is loaded as a component extension (via ComponentLoader),
    # so no --load-extension flag is needed.

    # User data dir
    user_data_dir = root_dir / 'chromium' / 'user_data'
    cmd.append(f'--user-data-dir={user_data_dir}')
    
    # Fix cross-device link error
    cmd.append('--disable-features=MacAppCodeSignClone,MacAppCodeSignCloneRenameAsBundle')
    
    # Pass through extra args
    if hasattr(args, 'args') and args.args:
        cmd.extend(args.args)

    logger.info(f"Launching Chromium...")
    logger.info(f"Command: {' '.join(cmd)}")
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        pass
