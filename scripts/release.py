#!/usr/bin/env python3
import argparse
import json
import sys
import subprocess
import os
import shutil
from pathlib import Path
from common import get_logger, get_project_root, get_agent_root, get_product_version

logger = get_logger()


def _load_env():
    """Load .env file from scripts/ directory into os.environ."""
    env_file = Path(__file__).parent / '.env'
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key, value = key.strip(), value.strip()
        if key and value:
            os.environ.setdefault(key, value)


_load_env()


def get_r2_client():
    """Create a boto3 S3 client for Cloudflare R2."""
    import boto3

    account_id = os.environ.get('R2_ACCOUNT_ID')
    access_key = os.environ.get('R2_ACCESS_KEY_ID')
    secret_key = os.environ.get('R2_SECRET_ACCESS_KEY')

    if not all([account_id, access_key, secret_key]):
        return None

    return boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
    )


R2_BUCKET = 'ocbot'
R2_CDN_BASE = 'https://cdn.oc.bot'


def upload_to_r2(artifacts, version, category):
    """Upload artifacts to R2 and update latest.json.

    Args:
        artifacts: list of Path objects to upload.
        version: version string like "26.3.18".
        category: "extension" or "browser".
    """
    client = get_r2_client()
    if not client:
        logger.warning("R2 credentials not set, skipping R2 upload. "
                       "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.")
        return

    # Upload each artifact
    uploaded = {}
    for artifact in artifacts:
        key = f'releases/{version}/{artifact.name}'
        logger.info(f"Uploading {artifact.name} to R2 ({key})...")

        content_type = 'application/octet-stream'
        if artifact.suffix == '.zip':
            content_type = 'application/zip'
        elif artifact.suffix == '.dmg':
            content_type = 'application/x-apple-diskimage'
        elif artifact.suffix == '.exe':
            content_type = 'application/x-msdownload'
        elif artifact.suffix == '.json':
            content_type = 'application/json'

        client.upload_file(
            str(artifact), R2_BUCKET, key,
            ExtraArgs={'ContentType': content_type},
        )
        uploaded[artifact.name] = f'{R2_CDN_BASE}/{key}'
        logger.info(f"  → {uploaded[artifact.name]}")

    # Read-merge-write latest.json
    latest = {}
    try:
        resp = client.get_object(Bucket=R2_BUCKET, Key='latest.json')
        latest = json.loads(resp['Body'].read())
    except client.exceptions.NoSuchKey:
        pass
    except Exception as e:
        logger.warning(f"Could not read existing latest.json: {e}")

    latest['version'] = version

    if category == 'extension':
        for name, url in uploaded.items():
            if name.endswith('.zip'):
                latest.setdefault('extension', {})['url'] = url
    elif category == 'browser':
        latest.setdefault('browser', {})
        for name, url in uploaded.items():
            if name.endswith('.dmg'):
                latest['browser'].setdefault('macos', {})['url'] = url
            elif name.endswith('.exe') and 'Setup' in name:
                latest['browser'].setdefault('windows', {})['url'] = url

    logger.info("Updating latest.json on R2...")
    client.put_object(
        Bucket=R2_BUCKET,
        Key='latest.json',
        Body=json.dumps(latest, indent=2),
        ContentType='application/json',
    )
    logger.info(f"  → {R2_CDN_BASE}/latest.json")

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

    result = subprocess.run(
        ['gh', 'release', 'view', tag, '--repo', repo],
        capture_output=True, text=True
    )
    exists = result.returncode == 0
        
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
        
    # Upload to R2 CDN
    upload_to_r2([zip_path], version, 'extension')

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

    # Collect all browser artifacts that exist in dist/
    artifacts = []
    candidates = [
        dist_dir / f"Ocbot-{version}.dmg",
        dist_dir / f"Ocbot-Setup-{version}.exe",
        dist_dir / f"Ocbot-{version}-win-x64-portable.zip",
        dist_dir / f"Ocbot-{version}-win-x64-mini.exe",
    ]
    for c in candidates:
        if c.exists():
            artifacts.append(c)

    if not artifacts:
        logger.error(f"No browser artifacts found in {dist_dir}. Run 'dev.py package' first.")
        sys.exit(1)

    logger.info(f"Preparing release for Ocbot v{version} (tag: {tag})...")

    repo = "instry/ocbot"

    # Check if release exists
    result = subprocess.run(
        ['gh', 'release', 'view', tag, '--repo', repo],
        capture_output=True, text=True
    )
    exists = result.returncode == 0

    if exists:
        logger.info(f"Release {tag} already exists. Uploading artifacts...")
        cmd = ['gh', 'release', 'upload', tag] + [str(a) for a in artifacts] + ['--clobber', '--repo', repo]
        run_command(cmd)
    else:
        logger.info(f"Creating release {tag} with artifacts...")
        cmd = ['gh', 'release', 'create', tag] + [str(a) for a in artifacts] + ['--repo', repo, '--title', f"Ocbot v{version}", '--notes', f"Ocbot v{version}"]
        run_command(cmd)

    # Upload to R2 CDN
    upload_to_r2(artifacts, version, 'browser')

    logger.info(f"Done! Ocbot v{version} released as {tag}")
    logger.info("Running instances will auto-update in the background.")
