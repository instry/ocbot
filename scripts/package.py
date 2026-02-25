#!/usr/bin/env python3
"""Package Ocbot into platform-specific installers (.dmg on macOS, .exe/.zip on Windows)."""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from common import get_logger, get_project_root, get_source_dir, get_product_version

if sys.platform == 'darwin':
    import plistlib

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


def sign_app(app_path, identity, entitlements=None):
    """Sign the application bundle for notarization.

    Signing order (inside-out):
      1. dylibs in Libraries/
      2. Standalone helper executables (app_mode_loader, crashpad, etc.)
      3. Helper .app bundles (inner exe first, then the bundle)
      4. The main framework bundle
      5. The top-level .app bundle
    Every binary gets --options runtime --timestamp so notarization passes.
    """
    logger.info(f"Signing {app_path} with identity '{identity}'...")

    if "Apple Distribution" in identity:
        logger.warning("WARNING: 'Apple Distribution' certificates cannot be notarized.")
        logger.warning("Use a 'Developer ID Application' certificate instead.")

    def _codesign(path, with_entitlements=False):
        cmd = [
            'codesign', '--force', '--verbose',
            '--options', 'runtime',
            '--timestamp',
            '--sign', identity,
        ]
        if with_entitlements and entitlements:
            cmd.extend(['--entitlements', str(entitlements)])
        cmd.append(str(path))
        logger.info(f"  Signing {path.name}")
        subprocess.run(cmd, check=True)

    try:
        contents = app_path / 'Contents'
        frameworks_dir = contents / 'Frameworks'

        # Find the main framework (e.g. Ocbot Framework.framework)
        main_framework = None
        for item in frameworks_dir.iterdir():
            if item.name.endswith('.framework'):
                main_framework = item
                break

        if main_framework:
            # 1. Sign all dylibs (Libraries/*.dylib)
            logger.info("Signing dylibs...")
            for lib in main_framework.glob('**/*.dylib'):
                _codesign(lib)

            # 2. Sign standalone helper executables (not inside .app bundles)
            logger.info("Signing standalone helper executables...")
            for helper_dir in main_framework.glob('**/Helpers'):
                if not helper_dir.is_dir():
                    continue
                for item in sorted(helper_dir.iterdir()):
                    if item.name.startswith('.'):
                        continue
                    if item.is_file() and os.access(item, os.X_OK):
                        _codesign(item, with_entitlements=True)

            # 3. Sign helper .app bundles (exe inside first, then the bundle)
            logger.info("Signing helper app bundles...")
            for helper_app in main_framework.glob('**/Helpers/*.app'):
                macos_dir = helper_app / 'Contents' / 'MacOS'
                if macos_dir.exists():
                    for exe in macos_dir.iterdir():
                        if exe.is_file():
                            _codesign(exe, with_entitlements=True)
                _codesign(helper_app, with_entitlements=True)

            # 4. Sign the framework bundle itself
            logger.info("Signing framework bundle...")
            _codesign(main_framework)

        # 5. Sign the top-level app bundle
        logger.info("Signing app bundle...")
        _codesign(app_path, with_entitlements=True)

        # Verify the signature
        logger.info("Verifying signature...")
        subprocess.run([
            'codesign', '--verify', '--deep', '--strict', '--verbose=2',
            str(app_path),
        ], check=True)
        logger.info("Signature verification passed.")

    except subprocess.CalledProcessError as e:
        logger.error(f"Signing failed: {e}")
        sys.exit(1)


def notarize_dmg(dmg_path, notary_profile=None, apple_id=None, team_id=None, password=None):
    """Notarize the DMG using xcrun notarytool."""
    logger.info(f"Notarizing {dmg_path}...")
    
    cmd = [
        'xcrun', 'notarytool', 'submit',
        str(dmg_path),
        '--wait'
    ]
    
    if notary_profile:
        cmd.extend(['--keychain-profile', notary_profile])
    elif apple_id and team_id and password:
        cmd.extend(['--apple-id', apple_id])
        cmd.extend(['--team-id', team_id])
        cmd.extend(['--password', password])
    else:
        logger.error("Notarization requires either a profile or (apple_id, team_id, password).")
        sys.exit(1)

    try:
        subprocess.run(cmd, check=True)
        
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
    app_name, _plist_version = _read_plist(app_path)
    product_version = get_product_version()
    logger.info(f"Packaging {app_name} ({product_version}) from {app_path}")

    project_root = get_project_root()
    dist_dir = project_root / 'dist'
    dist_dir.mkdir(exist_ok=True)

    if getattr(args, 'output', None):
        final_dmg = Path(args.output).resolve()
    else:
        final_dmg = dist_dir / f"{app_name}-{product_version}.dmg"

    vol_name = f"{app_name} {product_version}"
    icon_file = project_root / 'icons' / 'app.icns'

    # Code Signing
    sign_identity = getattr(args, 'sign', None) or os.environ.get('CODESIGN_IDENTITY')
    
    # Entitlements
    entitlements_file = project_root / 'ocbot' / 'app.entitlements'
    if not entitlements_file.exists():
        # Fallback to Chromium's entitlements if available, or just ignore
        pass

    if not sign_identity:
        # Check if NOTARY_PROFILE or apple-id/team-id/password is set, which implies official release intent
        notary_profile = getattr(args, 'notarize', None) or os.environ.get('NOTARY_PROFILE')
        apple_id = getattr(args, 'apple_id', None) or os.environ.get('APPLE_ID')
        team_id = getattr(args, 'team_id', None) or os.environ.get('TEAM_ID')
        password = getattr(args, 'password', None) or os.environ.get('NOTARY_PASSWORD')
        
        if notary_profile or (apple_id and team_id and password):
            logger.error("Code signing identity (--sign) is required for notarization.")
            sys.exit(1)

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
            entitlements = entitlements_file if entitlements_file.exists() else None
            sign_app(dest_app, sign_identity, entitlements)

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
    apple_id = getattr(args, 'apple_id', None) or os.environ.get('APPLE_ID')
    team_id = getattr(args, 'team_id', None) or os.environ.get('TEAM_ID')
    password = getattr(args, 'password', None) or os.environ.get('NOTARY_PASSWORD')

    if notary_profile or (apple_id and team_id and password):
        notarize_dmg(final_dmg, notary_profile, apple_id, team_id, password)

    # Verify
    logger.info("Verifying DMG...")
    subprocess.run(['hdiutil', 'verify', str(final_dmg)], check=True)

    size_mb = final_dmg.stat().st_size / (1024 * 1024)
    logger.info(f"Done: {final_dmg} ({size_mb:.1f} MB)")


def package_windows(args):
    """Package Ocbot for Windows: copy mini_installer.exe and create portable zip."""
    if getattr(args, 'src_dir', None):
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()

    # Resolve src subdirectory
    if (src_dir / 'src').exists() and (src_dir / 'src').is_dir():
        src_dir = src_dir / 'src'

    out_dir_name = 'Official' if getattr(args, 'official', False) else 'Default'
    out_dir = src_dir / 'out' / out_dir_name

    product_version = get_product_version()
    project_root = get_project_root()
    dist_dir = project_root / 'dist'
    dist_dir.mkdir(exist_ok=True)

    # --- 1. Copy mini_installer.exe ---
    mini_installer = out_dir / 'mini_installer.exe'
    if mini_installer.exists():
        dest_installer = dist_dir / f"Ocbot-{product_version}-win-x64.exe"
        shutil.copy2(mini_installer, dest_installer)
        size_mb = dest_installer.stat().st_size / (1024 * 1024)
        logger.info(f"Installer: {dest_installer} ({size_mb:.1f} MB)")
    else:
        logger.warning(f"mini_installer.exe not found at {mini_installer}, skipping installer.")

    # --- 2. Create portable zip ---
    # Collect essential runtime files from the build output
    portable_patterns = [
        '*.exe', '*.dll', '*.pak', '*.bin', '*.dat',
    ]
    portable_dirs = [
        'locales',
        'MEIPresto',
        'ocbot_extension',
    ]

    portable_zip_path = dist_dir / f"Ocbot-{product_version}-win-x64-portable.zip"
    logger.info(f"Creating portable zip: {portable_zip_path}")

    with zipfile.ZipFile(portable_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add files matching patterns
        for pattern in portable_patterns:
            for f in out_dir.glob(pattern):
                if f.is_file():
                    zf.write(f, f.name)

        # Add subdirectories
        for dirname in portable_dirs:
            dir_path = out_dir / dirname
            if dir_path.exists() and dir_path.is_dir():
                for f in dir_path.rglob('*'):
                    if f.is_file():
                        zf.write(f, str(f.relative_to(out_dir)))

        # Add icudtl.dat and v8 snapshot if present (sometimes at top level)
        for extra in ['icudtl.dat', 'v8_context_snapshot.bin', 'snapshot_blob.bin']:
            extra_path = out_dir / extra
            if extra_path.exists():
                zf.write(extra_path, extra)

    size_mb = portable_zip_path.stat().st_size / (1024 * 1024)
    logger.info(f"Portable zip: {portable_zip_path} ({size_mb:.1f} MB)")



