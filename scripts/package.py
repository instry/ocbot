#!/usr/bin/env python3
"""Package Ocbot into platform-specific installers (.dmg on macOS, .exe/.zip on Windows)."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from common import get_logger, get_project_root, get_source_dir, get_product_version, get_agent_root

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
        
        # Explicitly sign the main executable first to ensure Hardened Runtime is applied
        main_executable = app_path / 'Contents' / 'MacOS' / app_path.stem
        if main_executable.exists():
             logger.info(f"Signing main executable: {main_executable.name}")
             _codesign(main_executable, with_entitlements=True)
             
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
    
    auth_args = []
    if notary_profile:
        auth_args = ['--keychain-profile', notary_profile]
    elif apple_id and team_id and password:
        auth_args = ['--apple-id', apple_id, '--team-id', team_id, '--password', password]
    else:
        logger.error("Notarization requires either a profile or (apple_id, team_id, password).")
        sys.exit(1)

    cmd.extend(auth_args)

    try:
        # Run and capture output
        logger.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        # Output is text, not JSON
        logger.info(result.stdout)
        
        if "Accepted" in result.stdout:
            logger.info("Notarization Accepted.")
        else:
             logger.warning("Notarization status unknown (check logs above). Proceeding to stapling...")

        logger.info("Stapling ticket to DMG...")
        subprocess.run([
            'xcrun', 'stapler', 'staple', str(dmg_path)
        ], check=True)
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Notarization command failed: {e}")
        if e.stdout:
            logger.error(e.stdout)
        sys.exit(1)


def package_dmg(args):
    """Create a .dmg from the built .app bundle."""
    app_path = None
    if getattr(args, 'app_path', None):
        p = Path(args.app_path).resolve()
        if p.exists():
            app_path = p
        else:
            logger.error(f"App bundle not found: {p}")
            sys.exit(1)

    if not app_path:
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
    icon_file = project_root / 'chromium' / 'icons' / 'app.icns'

    # Code Signing
    sign_identity = getattr(args, 'sign', None) or os.environ.get('CODESIGN_IDENTITY')
    
    # Entitlements
    entitlements_file = project_root / 'app.entitlements'
    if not entitlements_file.exists():
        logger.warning(f"Entitlements file not found: {entitlements_file}")
        logger.warning("Signing without entitlements may cause crashes with hardened runtime.")

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
        # ext_src = getattr(args, 'extension_src', None)
        # if ext_src:
        #     ext_src = Path(ext_src)
        #     if ext_src.exists():
        #         logger.info(f"Copying extension from {ext_src} to DMG...")
        #         # Copy to a folder named "Ocbot Extension" in the DMG root
        #         shutil.copytree(ext_src, staging / 'Ocbot Extension')
        #     else:
        #         logger.warning(f"Extension source {ext_src} not found.")

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
                # Make the icon file invisible
                subprocess.run([
                    'SetFile', '-a', 'V', str(mount_point / '.VolumeIcon.icns'),
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


def _stage_files(out_dir, staging_dir):
    """Copy runtime files to staging directory."""
    staging_dir = Path(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)
    
    portable_patterns = [
        '*.exe', '*.dll', '*.pak', '*.bin', '*.dat','*.manifest'
    ]
    portable_dirs = [
        'locales',
        'MEIPresto',
        'resources',
    ]
    extra_files = ['icudtl.dat', 'v8_context_snapshot.bin', 'snapshot_blob.bin']

    logger.info(f"Staging files from {out_dir} to {staging_dir}...")

    # Copy patterns
    for pattern in portable_patterns:
        for f in out_dir.glob(pattern):
            if f.is_file():
                shutil.copy2(f, staging_dir / f.name)

    # Copy directories
    for dirname in portable_dirs:
        src = out_dir / dirname
        if src.exists() and src.is_dir():
            dest = staging_dir / dirname
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(src, dest)

    # Copy extra files
    for extra in extra_files:
        src = out_dir / extra
        if src.exists():
            shutil.copy2(src, staging_dir / extra)

# VC++ Redistributable download URLs (VS 2015-2022)
_VCREDIST_URLS = {
    'x64': "https://aka.ms/vs/17/release/vc_redist.x64.exe",
    'arm64': "https://aka.ms/vs/17/release/vc_redist.arm64.exe"
}

def _ensure_vcredist(staging_dir, target_cpu='x64'):
    """Ensure vc_redist.<arch>.exe is available in deps/ alongside staging dir.

    The Inno Setup script references {#SourceDir}\\..\\deps\\vc_redist.<arch>.exe,
    so we place it at <staging_parent>/deps/vc_redist.<arch>.exe.
    """
    deps_dir = Path(staging_dir).parent / 'deps'
    deps_dir.mkdir(exist_ok=True)
    
    filename = f'vc_redist.{target_cpu}.exe'
    vcredist = deps_dir / filename

    if vcredist.exists():
        logger.info(f"VC++ Redistributable already present: {vcredist}")
        return

    # Check project-local cache first (scripts/installer/win/deps/)
    cached = get_project_root() / 'scripts' / 'installer' / 'win' / 'deps' / filename
    if cached.exists():
        logger.info(f"Using cached VC++ Redistributable: {cached}")
        shutil.copy2(cached, vcredist)
        return

    # Download from Microsoft
    url = _VCREDIST_URLS.get(target_cpu)
    if not url:
        logger.error(f"Unsupported architecture for VC++ Redistributable: {target_cpu}")
        return

    logger.info(f"Downloading VC++ Redistributable from {url}...")
    try:
        import urllib.request
        urllib.request.urlretrieve(url, vcredist)
        size_mb = vcredist.stat().st_size / (1024 * 1024)
        logger.info(f"Downloaded {filename} ({size_mb:.1f} MB)")

        # Cache for future builds
        cached.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(vcredist, cached)
        logger.info(f"Cached to {cached}")
    except Exception as e:
        logger.warning(f"Failed to download VC++ Redistributable: {e}")
        logger.warning("Install may fail on systems without VC++ Runtime.")
        logger.warning(f"Manually download from {url} and place at {cached}")

def _create_inno_installer(staging_dir, dist_dir, version, target_cpu='x64'):
    """Create Inno Setup installer."""
    # Check for ISCC
    iscc = shutil.which('iscc')
    if not iscc:
        # Check common paths
        common_paths = [
            r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
            r"C:\Program Files\Inno Setup 6\ISCC.exe"
        ]
        for p in common_paths:
            if os.path.exists(p):
                iscc = p
                break

    if not iscc:
        logger.warning("Inno Setup Compiler (ISCC) not found. Skipping installer creation.")
        return

    # Ensure VC++ Redistributable is available for bundling
    _ensure_vcredist(staging_dir, target_cpu)

    iss_file = get_project_root() / 'scripts' / 'installer' / 'win' / 'setup.iss'
    if not iss_file.exists():
         logger.warning(f"Installer script not found at {iss_file}")
         return

    output_name = f"Ocbot-Setup-{version}-{target_cpu}"
    
    # Map target_cpu to Inno Setup architecture
    # Inno Setup uses "x64", "arm64", "x86"
    inno_arch = target_cpu 
    
    cmd = [
        iscc,
        f"/dMyAppVersion={version}",
        f"/dSourceDir={staging_dir}",
        f"/dTargetArch={inno_arch}",
        f"/O{dist_dir}",
        f"/F{output_name}",
        str(iss_file)
    ]

    logger.info(f"Running Inno Setup: {' '.join(cmd)}")
    try:
        subprocess.run(cmd, check=True)
        installer_path = dist_dir / f"{output_name}.exe"
        if installer_path.exists():
            size_mb = installer_path.stat().st_size / (1024 * 1024)
            logger.info(f"Inno Installer: {installer_path} ({size_mb:.1f} MB)")
    except subprocess.CalledProcessError as e:
        logger.error(f"Inno Setup failed: {e}")


def package_windows(args):
    """Package Ocbot for Windows: portable zip and Inno Setup installer."""
    if getattr(args, 'src_dir', None):
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()

    # Resolve src subdirectory
    if (src_dir / 'src').exists() and (src_dir / 'src').is_dir():
        src_dir = src_dir / 'src'

    out_dir_name = 'Official' if getattr(args, 'official', False) else 'Default'
    out_dir = src_dir / 'out' / out_dir_name

    # Sync extension before packaging
    extension_src = get_agent_root() / '.output' / 'chrome-mv3'
    if extension_src.exists():
        dest = out_dir / 'resources' / 'ocbot'
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(extension_src, dest)
        logger.info(f"Extension synced to {dest}")
    else:
        logger.warning(f"Extension build output not found: {extension_src}")

    product_version = get_product_version()
    project_root = get_project_root()
    dist_dir = project_root / 'dist'
    dist_dir.mkdir(exist_ok=True)

    # --- 1. Copy mini_installer.exe (if exists) ---
    mini_installer = out_dir / 'mini_installer.exe'
    if mini_installer.exists():
        dest_installer = dist_dir / f"Ocbot-{product_version}-win-x64-mini.exe"
        shutil.copy2(mini_installer, dest_installer)
        size_mb = dest_installer.stat().st_size / (1024 * 1024)
        logger.info(f"Mini Installer: {dest_installer} ({size_mb:.1f} MB)")

    # --- 2. Create Staging Directory ---
    import tempfile
    with tempfile.TemporaryDirectory() as staging_dir_str:
        staging_dir = Path(staging_dir_str)
        _stage_files(out_dir, staging_dir)

        # --- 3. Create Portable Zip ---
        portable_zip_path = dist_dir / f"Ocbot-{product_version}-win-x64-portable"
        logger.info(f"Creating portable zip: {portable_zip_path}.zip")
        shutil.make_archive(str(portable_zip_path), 'zip', staging_dir)
        
        # --- 4. Create Inno Setup Installer ---
        target_cpu = getattr(args, 'target_cpu', 'x64')
        _create_inno_installer(staging_dir, dist_dir, product_version, target_cpu)

    logger.info("Packaging complete.")
