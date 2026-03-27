#!/usr/bin/env python3
"""Build OpenClaw runtime layers for OTA distribution.

Produces two tar.gz archives:
  - base layer: node_modules/ (platform-specific, contains native modules)
  - app layer:  openclaw.mjs, package.json, dist/, extensions/, skills/, scripts/
"""

import hashlib
import json
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from common import get_logger, get_project_root

logger = get_logger()


def get_openclaw_dir():
    """Locate the OpenClaw source directory (sibling to ocbot workspace)."""
    return get_project_root().parent / 'openclaw'


def get_runtime_version(openclaw_dir=None):
    """Read version from openclaw/package.json."""
    if openclaw_dir is None:
        openclaw_dir = get_openclaw_dir()
    pkg = openclaw_dir / 'package.json'
    if not pkg.exists():
        logger.error(f"package.json not found at {pkg}")
        sys.exit(1)
    data = json.loads(pkg.read_text())
    return data['version']


def get_platform_tag():
    """Return platform tag: macos-arm64, macos-x64, or win-x64."""
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == 'darwin':
        arch = 'arm64' if machine == 'arm64' else 'x64'
        return f'macos-{arch}'
    elif system == 'windows':
        return 'win-x64'
    else:
        return f'linux-{machine}'


def sha256_file(path):
    """Compute SHA256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def build_base_layer(openclaw_dir, output_dir, platform_tag=None):
    """Build base layer tar.gz containing production node_modules.

    Args:
        openclaw_dir: Path to openclaw source.
        output_dir: Directory to write the archive to.
        platform_tag: Platform tag (e.g. macos-arm64). Auto-detected if None.

    Returns:
        (archive_path, sha256, version) tuple.
    """
    if platform_tag is None:
        platform_tag = get_platform_tag()

    version = get_runtime_version(openclaw_dir)
    base_version = f'base-{version}'

    logger.info(f"Building base layer ({platform_tag})...")

    with tempfile.TemporaryDirectory(prefix='ocbot-base-') as tmp:
        tmp_path = Path(tmp)

        # Copy package.json for npm install
        shutil.copy2(openclaw_dir / 'package.json', tmp_path / 'package.json')
        lock_file = openclaw_dir / 'package-lock.json'
        if lock_file.exists():
            shutil.copy2(lock_file, tmp_path / 'package-lock.json')

        # Install production dependencies
        _shell = sys.platform == 'win32'
        try:
            subprocess.run(
                ['npm', 'install', '--production'],
                cwd=tmp_path, check=True, shell=_shell,
                capture_output=True, text=True
            )
        except subprocess.CalledProcessError as e:
            logger.warning(f"npm install failed: {e.stderr}")
            # Fallback: pnpm deploy
            try:
                subprocess.run(
                    ['pnpm', 'deploy', '--prod', str(tmp_path)],
                    cwd=openclaw_dir, check=True, shell=_shell,
                    capture_output=True, text=True
                )
            except (subprocess.CalledProcessError, FileNotFoundError) as e2:
                logger.error(f"pnpm deploy also failed: {e2}")
                sys.exit(1)

        node_modules = tmp_path / 'node_modules'
        if not node_modules.exists():
            logger.error("node_modules not created")
            sys.exit(1)

        # Create tar.gz
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        archive_name = f'ocbot-runtime-{base_version}-{platform_tag}.tar.gz'
        archive_path = output_dir / archive_name

        logger.info(f"Creating {archive_name}...")
        with tarfile.open(archive_path, 'w:gz') as tar:
            tar.add(node_modules, arcname='node_modules')

    digest = sha256_file(archive_path)
    size = archive_path.stat().st_size
    logger.info(f"Base layer: {archive_path} ({size} bytes, sha256={digest[:16]}...)")

    return archive_path, digest, size, base_version


def build_app_layer(openclaw_dir, output_dir):
    """Build app layer tar.gz containing OpenClaw application files.

    Args:
        openclaw_dir: Path to openclaw source.
        output_dir: Directory to write the archive to.

    Returns:
        (archive_path, sha256, version) tuple.
    """
    version = get_runtime_version(openclaw_dir)
    app_version = f'app-{version}'

    logger.info("Building app layer...")

    # Ensure OpenClaw is built
    dist_dir = openclaw_dir / 'dist'
    if not dist_dir.exists():
        logger.info("OpenClaw dist/ not found, building...")
        _shell = sys.platform == 'win32'
        try:
            subprocess.run(['pnpm', 'install'], cwd=openclaw_dir, check=True, shell=_shell)
            subprocess.run(['pnpm', 'build'], cwd=openclaw_dir, check=True, shell=_shell)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.error(f"Failed to build OpenClaw: {e}")
            sys.exit(1)

    # Items to include (mirrors _install_openclaw_runtime in build.py)
    items = [
        ('openclaw.mjs', False),
        ('package.json', False),
        ('dist', True),
        ('extensions', True),
        ('skills', True),
    ]

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_name = f'ocbot-runtime-{app_version}.tar.gz'
    archive_path = output_dir / archive_name

    logger.info(f"Creating {archive_name}...")
    with tarfile.open(archive_path, 'w:gz') as tar:
        for item_name, is_dir in items:
            src = openclaw_dir / item_name
            if not src.exists():
                logger.warning(f"Skipping missing item: {src}")
                continue
            tar.add(src, arcname=item_name)

        # scripts/run-node.mjs
        run_node = openclaw_dir / 'scripts' / 'run-node.mjs'
        if run_node.exists():
            tar.add(run_node, arcname='scripts/run-node.mjs')

    digest = sha256_file(archive_path)
    size = archive_path.stat().st_size
    logger.info(f"App layer: {archive_path} ({size} bytes, sha256={digest[:16]}...)")

    return archive_path, digest, size, app_version
