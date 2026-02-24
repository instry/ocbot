#!/usr/bin/env python3
"""Package Ocbot.app into a .dmg installer."""

import argparse
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from common import get_logger, get_project_root, get_source_dir

logger = get_logger()


def _find_app(src_dir, is_official=False):
    """Find the built .app bundle in out/Default or out/Official."""
    out_dir_name = 'Official' if is_official else 'Default'
    out_dir = src_dir / 'src' / 'out' / out_dir_name
    if not out_dir.exists():
        out_dir = src_dir / 'out' / out_dir_name

    app = out_dir / 'Ocbot.app'
    if app.exists():
        return app

    # Try searching in the source dir itself if the structure is flat
    app = src_dir / 'out' / out_dir_name / 'Ocbot.app'
    if app.exists():
        return app

    logger.error(f"Ocbot.app not found in {out_dir}")
    sys.exit(1)


def _read_plist(app_path):
    """Read app name and version from Info.plist."""
    plist_path = app_path / 'Contents' / 'Info.plist'
    with open(plist_path, 'rb') as f:
        info = plistlib.load(f)
    version = info.get('CFBundleShortVersionString', 'unknown')
    name = info.get('CFBundleName', 'Ocbot')
    return name, version


def sign_app(app_path, identity):
    """Sign the application bundle."""
    logger.info(f"Signing {app_path} with identity '{identity}'...")
    try:
        subprocess.run([
            'codesign', '--deep', '--force', '--verbose',
            '--options', 'runtime',
            '--sign', identity,
            str(app_path)
        ], check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Signing failed: {e}")
        sys.exit(1)


def notarize_dmg(dmg_path, notary_profile):
    """Notarize the DMG using xcrun notarytool."""
    logger.info(f"Notarizing {dmg_path} with profile '{notary_profile}'...")
    try:
        subprocess.run([
            'xcrun', 'notarytool', 'submit',
            str(dmg_path),
            '--keychain-profile', notary_profile,
            '--wait'
        ], check=True)
        
        logger.info("Stapling ticket to DMG...")
        subprocess.run([
            'xcrun', 'stapler', 'staple', str(dmg_path)
        ], check=True)
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Notarization failed: {e}")
        sys.exit(1)


def package_dmg(args):
    """Create a .dmg from the built .app bundle."""
    if getattr(args, 'src_dir', None):
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()

    app_path = _find_app(src_dir, is_official=getattr(args, 'official', False))
    app_name, version = _read_plist(app_path)
    logger.info(f"Packaging {app_name} ({version}) from {app_path}")

    project_root = get_project_root()
    dist_dir = project_root / 'dist'
    dist_dir.mkdir(exist_ok=True)

    if getattr(args, 'output', None):
        final_dmg = Path(args.output).resolve()
    else:
        final_dmg = dist_dir / f"{app_name}-{version}.dmg"

    vol_name = f"{app_name} {version}"
    icon_file = project_root / 'icons' / 'app.icns'

    # Code Signing
    sign_identity = getattr(args, 'sign', None) or os.environ.get('CODESIGN_IDENTITY')

    with tempfile.TemporaryDirectory() as tmpdir:
        staging = Path(tmpdir) / 'staging'
        staging.mkdir()

        # Copy .app and create Applications symlink
        dest_app = staging / f"{app_name}.app"
        logger.info("Copying app bundle to staging area...")
        if dest_app.exists():
            shutil.rmtree(dest_app)
        shutil.copytree(app_path, dest_app, symlinks=True)

        # Copy extension if provided
        ext_src = getattr(args, 'extension_src', None)
        if ext_src:
            ext_src = Path(ext_src)
            if ext_src.exists():
                logger.info(f"Copying extension from {ext_src} to DMG...")
                # Copy to a folder named "Ocbot Extension" in the DMG root
                shutil.copytree(ext_src, staging / 'Ocbot Extension')
            else:
                logger.warning(f"Extension source {ext_src} not found.")

        # Sign the app in staging
        if sign_identity:
            sign_app(dest_app, sign_identity)

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

    # Notarization
    notary_profile = getattr(args, 'notarize', None) or os.environ.get('NOTARY_PROFILE')
    if notary_profile:
        notarize_dmg(final_dmg, notary_profile)

    # Verify
    logger.info("Verifying DMG...")
    subprocess.run(['hdiutil', 'verify', str(final_dmg)], check=True)

    size_mb = final_dmg.stat().st_size / (1024 * 1024)
    logger.info(f"Done: {final_dmg} ({size_mb:.1f} MB)")


