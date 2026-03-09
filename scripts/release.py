#!/usr/bin/env python3
import argparse
import sys
import subprocess
import os
import shutil
from pathlib import Path
from common import get_logger, get_project_root, get_agent_root, get_product_version

logger = get_logger()

def run_command(cmd, cwd=None, check=True, capture_output=False):
    try:
        result = subprocess.run(
            cmd, 
            cwd=cwd, 
            check=check, 
            capture_output=capture_output, 
            text=True
        )
        return result
    except subprocess.CalledProcessError as e:
        if check:
            logger.error(f"Command failed: {' '.join(cmd)}")
            if e.stderr:
                logger.error(e.stderr)
            sys.exit(1)
        raise e

def release_extension(args):
    """Release ocbot extension to GitHub Releases (instry/ocbot)."""
    project_root = get_project_root()
    agent_root = get_agent_root()
    dist_dir = project_root / 'dist'
    
    # Check prerequisites
    if not shutil.which('gh'):
        logger.error("GitHub CLI (gh) is not installed. Please install it first.")
        sys.exit(1)
        
    if not shutil.which('npm'):
        logger.error("npm is not installed.")
        sys.exit(1)

    # Get version
    version = get_product_version()
    tag = f"v{version}"

    logger.info(f"Preparing release for Ocbot v{version} (tag: {tag})...")
    
    # Build extension
    logger.info("Building extension...")
    run_command(['npm', 'run', 'build'], cwd=agent_root)

    # Package
    build_output = agent_root / '.output' / 'chrome-mv3'
    if not build_output.exists():
        logger.error(f"Build output not found at {build_output}")
        sys.exit(1)
        
    dist_dir.mkdir(exist_ok=True)
    zip_path = dist_dir / 'ocbot-extension.zip'
    
    # Remove old zip
    if zip_path.exists():
        zip_path.unlink()
        
    logger.info(f"Creating zip archive at {zip_path}...")
    # Use shutil.make_archive or zip command. 
    # shutil.make_archive creates .zip automatically, so we pass base_name without extension
    # But to match script behavior (cd build_output && zip -r ... .), we need to be careful with structure.
    # shutil.make_archive(base_name, format, root_dir)
    shutil.make_archive(str(dist_dir / 'ocbot-extension'), 'zip', build_output)
    
    # Check if release exists
    logger.info(f"Checking if release {tag} exists...")
    repo = "instry/ocbot"

    try:
        run_command(['gh', 'release', 'view', tag, '--repo', repo], check=True, capture_output=True)
        exists = True
    except subprocess.CalledProcessError:
        exists = False
        
    if exists:
        logger.info(f"Release {tag} already exists. Updating...")
        run_command([
            'gh', 'release', 'upload', tag, str(zip_path), 
            '--clobber', 
            '--repo', repo
        ])
    else:
        logger.info(f"Creating release {tag}...")
        run_command([
            'gh', 'release', 'create', tag, str(zip_path),
            '--repo', repo,
            '--title', f"Ocbot v{version}",
            '--notes', f"Ocbot v{version}"
        ])
        
    logger.info(f"Done! Ocbot v{version} released as {tag}")
    logger.info("Users will receive the update automatically on next browser restart.")


def release_browser(args):
    """Upload built DMG to GitHub Releases."""
    project_root = get_project_root()
    dist_dir = project_root / 'dist'

    # Check prerequisites
    if not shutil.which('gh'):
        logger.error("GitHub CLI (gh) is not installed. Please install it first.")
        sys.exit(1)

    # Get version
    version = get_product_version()
    tag = f"v{version}"
    dmg = dist_dir / f"Ocbot-{version}.dmg"

    if sys.platform == 'win32':
        # Match package.py output for Windows
        artifacts = []
        portable = dist_dir / f"Ocbot-{version}-win-x64-portable.zip"
        installer = dist_dir / f"Ocbot-Setup-{version}.exe"
        mini = dist_dir / f"Ocbot-{version}-win-x64-mini.exe"
        
        if portable.exists():
            artifacts.append(portable)
        if installer.exists():
            artifacts.append(installer)
        if mini.exists():
            artifacts.append(mini)
            
        if not artifacts:
             logger.error(f"No Windows artifacts found in {dist_dir}. Run 'dev.py package' first.")
             sys.exit(1)
    else:
        if not dmg.exists():
            logger.error(f"DMG not found: {dmg}. Run 'dev.py package' first.")
            sys.exit(1)
        artifacts = [dmg]

    logger.info(f"Preparing release for Ocbot v{version} (tag: {tag})...")

    repo = "instry/ocbot"

    # Check if release exists
    try:
        run_command(['gh', 'release', 'view', tag, '--repo', repo], check=True, capture_output=True)
        exists = True
    except subprocess.CalledProcessError:
        exists = False

    if exists:
        logger.info(f"Release {tag} already exists. Uploading artifacts...")
        cmd = ['gh', 'release', 'upload', tag] + [str(a) for a in artifacts] + ['--clobber', '--repo', repo]
        run_command(cmd)
    else:
        logger.info(f"Creating release {tag} with artifacts...")
        cmd = ['gh', 'release', 'create', tag] + [str(a) for a in artifacts] + ['--repo', repo, '--title', f"Ocbot v{version}", '--notes', f"Ocbot v{version}"]
        run_command(cmd)

    logger.info(f"Done! Ocbot v{version} released as {tag}")
    logger.info("Running instances will auto-update in the background.")
