#!/usr/bin/env python3
"""Package Ocbot.app into a .dmg installer."""

import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from common import get_logger, get_project_root, get_source_dir

logger = get_logger()


def _find_app(src_dir):
    """Find the built .app bundle in out/Default."""
    out_dir = src_dir / 'src' / 'out' / 'Default'
    if not out_dir.exists():
        out_dir = src_dir / 'out' / 'Default'

    for name in ('Ocbot.app', 'Chromium.app'):
        app = out_dir / name
        if app.exists():
            return app

    logger.error(f"No .app bundle found in {out_dir}")
    sys.exit(1)


def _read_plist(app_path):
    """Read app name and version from Info.plist."""
    plist_path = app_path / 'Contents' / 'Info.plist'
    with open(plist_path, 'rb') as f:
        info = plistlib.load(f)
    version = info.get('CFBundleShortVersionString', 'unknown')
    return 'Ocbot', version


def package_dmg(args):
    """Create a .dmg from the built .app bundle."""
    if getattr(args, 'src_dir', None):
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()

    app_path = _find_app(src_dir)
    app_name, version = _read_plist(app_path)
    logger.info(f"Packaging {app_name} ({version}) from {app_path}")

    project_root = get_project_root()
    dist_dir = project_root / 'dist'
    dist_dir.mkdir(exist_ok=True)

    if getattr(args, 'output', None):
        final_dmg = Path(args.output).resolve()
    else:
        final_dmg = dist_dir / f"{app_name}.dmg"

    vol_name = app_name
    icon_file = project_root / 'icons' / 'app.icns'

    with tempfile.TemporaryDirectory() as tmpdir:
        staging = Path(tmpdir) / 'staging'
        staging.mkdir()

        # Copy .app and create Applications symlink
        logger.info("Copying app bundle to staging area...")
        shutil.copytree(app_path, staging / f"{app_name}.app", symlinks=False)
        (staging / 'Applications').symlink_to('/Applications')

        # Create writable DMG
        rw_dmg = Path(tmpdir) / 'rw.dmg'
        logger.info("Creating writable DMG...")
        subprocess.run([
            'hdiutil', 'create',
            '-srcfolder', str(staging),
            '-volname', vol_name,
            '-format', 'UDRW',
            '-fs', 'HFS+',
            str(rw_dmg),
        ], check=True)

        # Set volume icon if available
        if icon_file.exists():
            mount_point = Path(tmpdir) / 'mount'
            mount_point.mkdir()
            logger.info("Setting volume icon...")
            subprocess.run([
                'hdiutil', 'attach', str(rw_dmg),
                '-mountpoint', str(mount_point),
                '-nobrowse', '-quiet',
            ], check=True)
            try:
                shutil.copy2(icon_file, mount_point / '.VolumeIcon.icns')
                subprocess.run([
                    'SetFile', '-c', 'icnC', str(mount_point / '.VolumeIcon.icns'),
                ], check=False)
                subprocess.run([
                    'SetFile', '-a', 'C', str(mount_point),
                ], check=False)
            finally:
                subprocess.run([
                    'hdiutil', 'detach', str(mount_point), '-quiet',
                ], check=True)

        # Convert to compressed DMG
        logger.info("Compressing DMG (LZMA)...")
        if final_dmg.exists():
            final_dmg.unlink()
        subprocess.run([
            'hdiutil', 'convert', str(rw_dmg),
            '-format', 'ULMO',
            '-o', str(final_dmg),
        ], check=True)

    # Verify
    logger.info("Verifying DMG...")
    subprocess.run(['hdiutil', 'verify', str(final_dmg)], check=True)

    size_mb = final_dmg.stat().st_size / (1024 * 1024)
    logger.info(f"Done: {final_dmg} ({size_mb:.1f} MB)")
