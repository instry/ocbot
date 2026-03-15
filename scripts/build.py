import subprocess
import os
import shutil
import sys
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root, get_agent_root, sync_extension_version


def _install_extension(logger, out_dir):
    """Copy built extension into the app bundle or build output directory."""
    extension_src = get_agent_root() / '.output' / 'chrome-mv3'
    if not extension_src.exists():
        logger.warning(f"Extension build output not found: {extension_src}")
        return

    if sys.platform == 'win32':
        # Windows: extension goes alongside the exe in out/Default/ocbot_extension/
        dest = out_dir / 'ocbot'
    else:
        # macOS: extension goes into Framework Resources inside the app bundle
        app_dir = out_dir / 'Ocbot.app'
        if not app_dir.exists():
            logger.warning(f"App bundle not found: {app_dir}")
            return

        frameworks_dir = app_dir / 'Contents' / 'Frameworks'
        framework = None
        if frameworks_dir.exists():
            for item in frameworks_dir.iterdir():
                if item.name.endswith('.framework'):
                    framework = item
                    break

        if not framework:
            logger.warning("Framework bundle not found in app bundle")
            return

        dest = framework / 'Resources' / 'ocbot'

    # Remove old copy and replace
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(extension_src, dest)
    logger.info(f"Extension installed to {dest}")

def build_chromium(args):
    logger = get_logger()
    
    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()
    
    if not src_dir.exists():
        logger.error("Source directory not found.")
        return

    logger.info("Starting build process...")
    logger.info("NOTE: This requires 'gn' and 'ninja' to be in PATH and depot_tools configured.")
    
    if args.official:
        out_dir = src_dir / 'out' / 'Official'
        logger.info(f"Building OFFICIAL release in {out_dir}")
        flags = [
            'is_official_build=true',
            'is_debug=false',
            'symbol_level=0',
            'use_siso=true',
            'chrome_pgo_phase=0',  # Skip PGO for simplicity
            'enable_update_notifications=true',
        ]
    else:
        out_dir = src_dir / 'out' / 'Default'
        logger.info(f"Building DEV release in {out_dir}")
        # Basic flags for ungoogled-chromium
        flags = [
            'is_debug=false',
            'symbol_level=0',
            'use_siso=true',
            'enable_update_notifications=true',
        ]
    
    # Clean output directory if requested
    if getattr(args, 'clean', False):
        if out_dir.exists():
            logger.info(f"Cleaning output directory {out_dir}...")
            shutil.rmtree(out_dir)

    # Always ensure gn is available and args.gn is correct
    if shutil.which('gn') is None:
            logger.error("'gn' command not found. Please install depot_tools and add to PATH.")
            return

    # Check if args.gn exists and if use_siso needs to be added
    args_gn_path = out_dir / 'args.gn'
    needs_gen = False
    needs_clean = False
    
    if args_gn_path.exists():
        with open(args_gn_path, 'r') as f:
            content = f.read()
        if 'use_siso=true' not in content:
            logger.info("Enabling siso in existing args.gn...")
            with open(args_gn_path, 'a') as f:
                f.write('\nuse_siso=true\n')
            needs_clean = True
            needs_gen = True
    else:
        logger.info("Generating build files with gn...")
        # Write args.gn
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(args_gn_path, 'w') as f:
            f.write('\n'.join(flags))
        needs_gen = True
    
    if needs_clean:
        logger.info(f"Cleaning output directory {out_dir} for siso migration...")
        gn_cmd = 'gn'
        if sys.platform == 'win32' and shutil.which('gn.bat'):
            gn_cmd = 'gn.bat'
        subprocess.run([gn_cmd, 'clean', str(out_dir)], cwd=src_dir, check=True)

    if needs_gen:
        gn_cmd = 'gn'
        if sys.platform == 'win32':
             # Use gn.bat if it exists, otherwise gn.exe (depot_tools usually has gn.bat wrapping gn.exe)
             # But gn.exe is the actual binary.
             # However, subprocess.run(['gn', ...]) usually works because gn is an exe.
             # Just in case, try to find it.
             if shutil.which('gn.bat'):
                 gn_cmd = 'gn.bat'
        
        subprocess.run([gn_cmd, 'gen', str(out_dir)], cwd=src_dir, check=True)
    
    logger.info(f"Building {args.target}...")
    
    # On Windows, autoninja is a batch file (autoninja.bat)
    autoninja_cmd = 'autoninja'
    if sys.platform == 'win32':
        autoninja_cmd = 'autoninja.bat'
        
    subprocess.run([autoninja_cmd, '-C', str(out_dir), args.target], cwd=src_dir)

    # Sync extension version before installing
    sync_extension_version()

    # Copy extension into app bundle so component_loader can find it
    _install_extension(logger, out_dir)
