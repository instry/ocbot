import subprocess
import os
import shutil
import sys
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root, get_agent_root, sync_extension_version, get_out_dir_name


def _install_extension(logger, out_dir):
    """Copy built extension into the app bundle or build output directory."""
    extension_src = get_agent_root() / '.output' / 'chrome-mv3'
    if not extension_src.exists():
        logger.warning(f"Extension build output not found: {extension_src}")
        return

    if sys.platform == 'win32':
        # Windows: DIR_RESOURCES resolves to <exe_dir>/resources/
        dest = out_dir / 'resources' / 'ocbot'
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


def _is_macho(path):
    """Check if a file is a Mach-O binary."""
    try:
        result = subprocess.run(
            ['file', '--brief', str(path)],
            capture_output=True, text=True, check=True
        )
        return 'mach-o' in result.stdout.lower()
    except subprocess.CalledProcessError:
        return False


def _lipo_merge(logger, universal_app, arm64_app, x64_app):
    """Walk a .app bundle and lipo-merge all Mach-O binaries from arm64 and x64 builds."""
    merged = 0
    skipped = 0
    for universal_path in universal_app.rglob('*'):
        if universal_path.is_symlink() or not universal_path.is_file():
            continue
        rel = universal_path.relative_to(universal_app)
        arm64_path = arm64_app / rel
        x64_path = x64_app / rel
        if not arm64_path.exists() or not x64_path.exists():
            continue
        if not _is_macho(arm64_path):
            continue
        try:
            subprocess.run(
                ['lipo', '-create', str(arm64_path), str(x64_path), '-output', str(universal_path)],
                check=True, capture_output=True, text=True
            )
            merged += 1
        except subprocess.CalledProcessError as e:
            logger.warning(f"lipo failed for {rel}: {e.stderr.strip()}")
            skipped += 1
    logger.info(f"lipo merge complete: {merged} binaries merged, {skipped} skipped")


def _create_universal_binary(args):
    """Merge arm64 and x64 builds into a universal binary .app bundle."""
    logger = get_logger()

    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()

    arm64_dir = src_dir / 'out' / get_out_dir_name(args.official, 'arm64')
    x64_dir = src_dir / 'out' / get_out_dir_name(args.official, 'x64')
    universal_dir = src_dir / 'out' / get_out_dir_name(args.official, 'universal')

    arm64_app = arm64_dir / 'Ocbot.app'
    x64_app = x64_dir / 'Ocbot.app'

    if not arm64_app.exists():
        logger.error(f"arm64 app not found: {arm64_app}")
        return
    if not x64_app.exists():
        logger.error(f"x64 app not found: {x64_app}")
        return

    # Copy arm64 build as the base for the universal binary
    universal_app = universal_dir / 'Ocbot.app'
    if universal_app.exists():
        shutil.rmtree(universal_app)
    universal_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Copying arm64 app as universal base...")
    shutil.copytree(arm64_app, universal_app, symlinks=True)

    # Merge all Mach-O binaries
    logger.info("Merging Mach-O binaries with lipo...")
    _lipo_merge(logger, universal_app, arm64_app, x64_app)

    # Sync extension version and install into universal app
    sync_extension_version()
    _install_extension(logger, universal_dir)

    logger.info(f"Universal binary created: {universal_app}")


def _build_single_arch(args, arch=None):
    """Build Chromium for a single architecture."""
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

    out_dir = src_dir / 'out' / get_out_dir_name(args.official, arch)

    if args.official:
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
        logger.info(f"Building DEV release in {out_dir}")
        # Basic flags for ungoogled-chromium
        flags = [
            'is_debug=false',
            'symbol_level=0',
            'use_siso=true',
            'enable_update_notifications=true',
        ]

    # Add target_cpu when cross-compiling
    if arch:
        flags.append(f'target_cpu="{arch}"')

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


def build_chromium(args):
    """Build Chromium, dispatching to single-arch or universal build."""
    arch = getattr(args, 'arch', None)
    # Default to universal for official macOS builds
    if arch is None and args.official and sys.platform == 'darwin':
        arch = 'universal'
    if arch == 'universal':
        if sys.platform != 'darwin':
            get_logger().error("Universal binary is macOS only.")
            return
        _build_single_arch(args, 'arm64')
        _build_single_arch(args, 'x64')
        _create_universal_binary(args)
        return

    _build_single_arch(args, arch)

    # Sync extension version and install for non-universal builds
    sync_extension_version()
    logger = get_logger()
    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()
    out_dir = src_dir / 'out' / get_out_dir_name(args.official, arch)
    _install_extension(logger, out_dir)
