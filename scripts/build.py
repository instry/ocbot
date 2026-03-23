import subprocess
import hashlib
import os
import shutil
import sys
import platform
import tarfile
import zipfile
import urllib.request
import hashlib
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root, get_agent_root, sync_extension_version, get_out_dir_name

# Node.js version to embed
NODE_VERSION = 'v22.16.0'
# Cache downloaded Node.js archives here
NODE_CACHE_DIR = Path.home() / '.cache' / 'ocbot' / 'node'


def _get_resources_dir(logger, out_dir):
    """Locate the Resources directory inside the app bundle (macOS) or resources/ (Windows)."""
    if sys.platform == 'win32':
        return out_dir / 'resources'

    app_dir = out_dir / 'Ocbot.app'
    if not app_dir.exists():
        logger.warning(f"App bundle not found: {app_dir}")
        return None

    frameworks_dir = app_dir / 'Contents' / 'Frameworks'
    if not frameworks_dir.exists():
        logger.warning("Frameworks directory not found in app bundle")
        return None

    for item in frameworks_dir.iterdir():
        if item.name.endswith('.framework'):
            return item / 'Resources'

    logger.warning("Framework bundle not found in app bundle")
    return None


def _install_node(logger, out_dir):
    """Download Node.js binary and install into app bundle Resources/node."""
    resources_dir = _get_resources_dir(logger, out_dir)
    if not resources_dir:
        return

    if sys.platform == 'win32':
        node_dest = resources_dir / 'node.exe'
    else:
        node_dest = resources_dir / 'node'

    # Skip if node binary already exists and version matches
    version_marker = resources_dir / '.node-version'
    if node_dest.exists() and version_marker.exists() and version_marker.read_text().strip() == NODE_VERSION:
        logger.info(f"Node.js {NODE_VERSION} already installed, skipping.")
        return

    # Determine platform and architecture for download URL
    if sys.platform == 'darwin':
        arch = platform.machine()  # 'arm64' or 'x86_64'
        if arch == 'x86_64':
            arch = 'x64'
        node_platform = f'darwin-{arch}'
        archive_name = f'node-{NODE_VERSION}-{node_platform}.tar.gz'
        node_bin_path = f'node-{NODE_VERSION}-{node_platform}/bin/node'
    elif sys.platform == 'win32':
        node_platform = 'win-x64'
        archive_name = f'node-{NODE_VERSION}-{node_platform}.zip'
        node_bin_path = f'node-{NODE_VERSION}-{node_platform}/node.exe'
    else:
        logger.warning(f"Unsupported platform for Node.js embedding: {sys.platform}")
        return

    download_url = f'https://nodejs.org/dist/{NODE_VERSION}/{archive_name}'

    # Cache the download
    NODE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached_archive = NODE_CACHE_DIR / archive_name

    if not cached_archive.exists():
        logger.info(f"Downloading Node.js {NODE_VERSION} for {node_platform}...")
        logger.info(f"  URL: {download_url}")
        try:
            urllib.request.urlretrieve(download_url, cached_archive)
        except Exception as e:
            logger.error(f"Failed to download Node.js: {e}")
            if cached_archive.exists():
                cached_archive.unlink()
            return
        logger.info(f"  Cached to {cached_archive}")
    else:
        logger.info(f"Using cached Node.js archive: {cached_archive}")

    # Extract the node binary
    logger.info(f"Extracting node binary to {node_dest}...")
    try:
        if archive_name.endswith('.tar.gz'):
            with tarfile.open(cached_archive, 'r:gz') as tar:
                member = tar.getmember(node_bin_path)
                f = tar.extractfile(member)
                if f is None:
                    logger.error(f"Could not extract {node_bin_path} from archive")
                    return
                node_dest.parent.mkdir(parents=True, exist_ok=True)
                with open(node_dest, 'wb') as out:
                    out.write(f.read())
        elif archive_name.endswith('.zip'):
            with zipfile.ZipFile(cached_archive, 'r') as zf:
                with zf.open(node_bin_path) as f:
                    node_dest.parent.mkdir(parents=True, exist_ok=True)
                    with open(node_dest, 'wb') as out:
                        out.write(f.read())
    except Exception as e:
        logger.error(f"Failed to extract Node.js binary: {e}")
        return

    # Ensure executable permission on Unix
    if sys.platform != 'win32':
        os.chmod(node_dest, 0o755)

    size_mb = node_dest.stat().st_size / (1024 * 1024)
    logger.info(f"Node.js installed to {node_dest} ({size_mb:.1f} MB)")
    version_marker.write_text(NODE_VERSION)


def _install_openclaw_runtime(logger, out_dir):
    """Package OpenClaw runtime and install into app bundle Resources/openclaw/."""
    resources_dir = _get_resources_dir(logger, out_dir)
    if not resources_dir:
        return

    openclaw_src = get_project_root().parent / 'openclaw'
    if not openclaw_src.exists():
        logger.warning(f"OpenClaw source not found: {openclaw_src}")
        return

    # Ensure OpenClaw is built
    dist_dir = openclaw_src / 'dist'
    if not dist_dir.exists():
        logger.info("OpenClaw dist/ not found, building...")
        _shell = sys.platform == 'win32'
        try:
            subprocess.run(['pnpm', 'install'], cwd=openclaw_src, check=True, shell=_shell)
            subprocess.run(['pnpm', 'build'], cwd=openclaw_src, check=True, shell=_shell)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.error(f"Failed to build OpenClaw: {e}")
            return

    dest = resources_dir / 'openclaw'
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    # Copy essential files
    items_to_copy = [
        ('openclaw.mjs', False),
        ('package.json', False),
        ('dist', True),
        ('extensions', True),
        ('skills', True),
        ('docs', True),
    ]

    # Also copy scripts/run-node.mjs if it exists
    run_node = openclaw_src / 'scripts' / 'run-node.mjs'
    if run_node.exists():
        (dest / 'scripts').mkdir(parents=True, exist_ok=True)
        shutil.copy2(run_node, dest / 'scripts' / 'run-node.mjs')

    for item_name, is_dir in items_to_copy:
        src_item = openclaw_src / item_name
        if not src_item.exists():
            logger.warning(f"OpenClaw item not found, skipping: {src_item}")
            continue
        dest_item = dest / item_name
        if is_dir:
            shutil.copytree(src_item, dest_item, symlinks=True)
        else:
            shutil.copy2(src_item, dest_item)

    # Install production dependencies (skip if package.json unchanged)
    pkg_json = dest / 'package.json'
    node_modules = dest / 'node_modules'
    hash_file = dest / '.pkg-hash'
    pkg_hash = ''
    if pkg_json.exists():
        pkg_hash = hashlib.md5(pkg_json.read_bytes()).hexdigest()
    if node_modules.exists() and hash_file.exists() and hash_file.read_text().strip() == pkg_hash:
        logger.info("OpenClaw dependencies unchanged, skipping npm install.")
    else:
        logger.info("Installing OpenClaw production dependencies...")
        _shell = sys.platform == 'win32'
        try:
            subprocess.run(
                ['npm', 'install', '--production', '--prefix', str(dest)],
                check=True, shell=_shell,
                capture_output=True, text=True
            )
        except subprocess.CalledProcessError as e:
            logger.warning(f"npm install --production failed: {e.stderr}")
            # Try pnpm deploy as fallback
            try:
                import tempfile
                with tempfile.TemporaryDirectory() as tmp:
                    subprocess.run(
                        ['pnpm', 'deploy', '--prod', str(dest)],
                        cwd=openclaw_src, check=True, shell=_shell,
                        capture_output=True, text=True
                    )
            except (subprocess.CalledProcessError, FileNotFoundError) as e2:
                logger.warning(f"pnpm deploy fallback also failed: {e2}")
        except FileNotFoundError:
            logger.warning("npm not found, trying pnpm deploy...")
            try:
                subprocess.run(
                    ['pnpm', 'deploy', '--prod', str(dest)],
                    cwd=openclaw_src, check=True, shell=_shell,
                    capture_output=True, text=True
                )
            except (subprocess.CalledProcessError, FileNotFoundError) as e2:
                logger.warning(f"pnpm deploy also failed: {e2}")
        # Save hash so next build can skip if unchanged
        if pkg_hash:
            hash_file.write_text(pkg_hash)

    logger.info(f"OpenClaw runtime installed to {dest}")


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

    # Copy menu bar icon to Framework Resources (macOS only).
    if sys.platform != 'win32':
        icon_src = get_source_dir() / 'chrome' / 'app' / 'theme' / 'chromium' / 'ocbot_toolbar_icon.png'
        if icon_src.exists():
            icon_dest = framework / 'Resources' / 'ocbot_toolbar_icon.png'
            shutil.copy2(icon_src, icon_dest)
            logger.info(f"Status bar icon installed to {icon_dest}")


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
    _install_node(logger, universal_dir)
    _install_openclaw_runtime(logger, universal_dir)

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

    # Shared flags for all builds
    common_flags = [
        'use_siso=true',
        'enable_update_notifications=true',

        # Codecs & media
        'proprietary_codecs=true',
        'ffmpeg_branding="Chrome"',
        'enable_widevine=true',
        'enable_mse_mpeg2ts_stream_parser=true',

        # Google services (disabled — we don't use them)
        'google_api_key=""',
        'google_default_client_id=""',
        'google_default_client_secret=""',
        'use_official_google_api_keys=false',
        'enable_reporting=false',
    ]

    # Platform-specific flags
    if sys.platform == 'darwin':
        common_flags.append('enable_platform_hevc=true')
    elif sys.platform == 'linux':
        common_flags.append('use_vaapi=true')

    if args.official:
        logger.info(f"Building OFFICIAL release in {out_dir}")
        flags = common_flags + [
            'is_official_build=true',
            'is_debug=false',
            'symbol_level=0',
            'chrome_pgo_phase=0',  # Skip PGO for simplicity
        ]
    else:
        logger.info(f"Building DEV release in {out_dir}")
        flags = common_flags + [
            'is_debug=false',
            'symbol_level=0',
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

    # Check if args.gn exists and needs updating
    args_gn_path = out_dir / 'args.gn'
    needs_gen = False
    expected_content = '\n'.join(flags)

    if args_gn_path.exists():
        with open(args_gn_path, 'r') as f:
            content = f.read()
        if content.strip() != expected_content.strip():
            logger.info("Updating args.gn with current flags...")
            with open(args_gn_path, 'w') as f:
                f.write(expected_content)
            needs_gen = True
    else:
        logger.info("Generating build files with gn...")
        # Write args.gn
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(args_gn_path, 'w') as f:
            f.write('\n'.join(flags))
        needs_gen = True

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
    _install_node(logger, out_dir)
    _install_openclaw_runtime(logger, out_dir)
