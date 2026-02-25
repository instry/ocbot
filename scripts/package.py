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
    """Sign the application bundle."""
    logger.info(f"Signing {app_path} with identity '{identity}'...")
    
    # NOTE: For official notarization, we MUST use a 'Developer ID Application' certificate.
    if "Apple Distribution" in identity:
        logger.warning("WARNING: You are signing with an 'Apple Distribution' certificate.")
        logger.warning("Notarization will likely FAIL.")

    # Helper to sign a single file
    def sign_file(path, with_entitlements=False):
        cmd = [
            'codesign', '--force', '--verbose',
            '--options', 'runtime',
            '--timestamp',
            '--sign', identity,
        ]
        if with_entitlements and entitlements:
            cmd.extend(['--entitlements', str(entitlements)])
        cmd.append(str(path))
        subprocess.run(cmd, check=True)

    try:
        # 1. Sign all dylibs and frameworks first (deepest first)
        # We need to find:
        # - Frameworks/*.framework/Versions/A/Libraries/*.dylib
        # - Frameworks/*.framework/Versions/A/Frameworks/*.framework
        # - Frameworks/*.framework/Versions/A/Helpers/*.app/Contents/MacOS/*
        # - Frameworks/*.framework
        
        # A simple way is to walk and sign everything that looks binary, 
        # but order matters (inside out).
        
        # Strategy:
        # 1. Frameworks/Ocbot Framework.framework/Versions/Current/Libraries/*.dylib
        # 2. Frameworks/Ocbot Framework.framework/Versions/Current/Helpers/* (executables)
        # 3. Frameworks/Ocbot Framework.framework (the framework itself)
        # 4. Main App Executable (implicitly by signing the app bundle?) 
        #    Actually signing the app bundle with --deep *should* work if everything is standard,
        #    but Chromium is weird.
        
        # Let's try explicit path signing for what we know exists in Chromium layout.
        
        contents = app_path / 'Contents'
        frameworks_dir = contents / 'Frameworks'
        
        # Find the main framework (e.g. Ocbot Framework.framework)
        main_framework = None
        for item in frameworks_dir.iterdir():
            if item.name.endswith('.framework'):
                main_framework = item
                break
        
        if main_framework:
            # We assume the layout: Framework.framework/Versions/A/...
            # But we can work with the 'Versions/Current' symlink or just explore.
            # Let's just use `find` to sign all .dylib and executables inside Frameworks
            
            # Sign Libraries (*.dylib)
            for lib in main_framework.glob('**/*.dylib'):
                sign_file(lib)

            # Sign Helpers
            # Helpers include both .app bundles and standalone executables.
            # We need to sign standalone executables first, then .app bundles.
            for helper_dir in main_framework.glob('**/Helpers'):
                if not helper_dir.is_dir():
                    continue
                for item in helper_dir.iterdir():
                    if item.name.startswith('.'):
                        continue
                    if item.is_file() and os.access(item, os.X_OK):
                        # Standalone executable (e.g. app_mode_loader,
                        # chrome_crashpad_handler, web_app_shortcut_copier)
                        sign_file(item, with_entitlements=True)

            for helper_app in main_framework.glob('**/Helpers/*.app'):
                # Sign the executable inside the helper
                # We can also sign the helper app bundle itself
                # Let's just sign the whole helper app bundle with --deep
                # But to be safe, sign the executable first? 
                # codesign --deep on the .app helper should be enough for the helper.
                # But let's be explicit.
                
                # Sign executable inside helper
                macos_dir = helper_app / 'Contents' / 'MacOS'
                if macos_dir.exists():
                    for exe in macos_dir.iterdir():
                        if exe.is_file():
                            sign_file(exe, with_entitlements=True) # Helpers need entitlements too?
                
                # Sign the helper app bundle
                sign_file(helper_app, with_entitlements=True)

            # Sign the Framework itself
            # We should sign the actual dylib inside the framework
            # e.g. Ocbot Framework.framework/Versions/A/Ocbot Framework
            framework_name = main_framework.stem # "Ocbot Framework"
            framework_bin = main_framework / 'Versions' / 'Current' / framework_name
            if not framework_bin.exists():
                 # Try finding it without 'Current' link if it's broken in staging?
                 # usually Current -> A
                 pass
            
            # Just sign the top level framework folder? No, codesign wants the binary or bundle.
            # For a framework, we sign the versioned folder or the binary?
            # Usually signing the framework bundle is enough.
            sign_file(main_framework)

        # Finally, sign the main application bundle
        # We use --deep here to catch anything we missed, but since we signed the heavy stuff
        # explicitly, it should be fine.
        # WAIT: If we use --deep on the main app, it might overwrite signatures or complain.
        # But we force it.
        
        cmd = [
            'codesign', '--force', '--verbose',
            '--options', 'runtime',
            '--timestamp',
            '--sign', identity,
        ]
        if entitlements:
            cmd.extend(['--entitlements', str(entitlements)])
        cmd.append(str(app_path))
        
        subprocess.run(cmd, check=True)
        
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



