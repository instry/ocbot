import os
import shutil
import tarfile
import urllib.request
import subprocess
from pathlib import Path
from common import get_logger, get_build_dir, get_project_root

def get_chromium_version():
    # Read from local resources
    version_file = get_project_root() / 'resources' / 'chromium_version.txt'
    if version_file.exists():
        return version_file.read_text().strip()
    return None

def download_source(args):
    logger = get_logger()
    build_dir = get_build_dir()
    build_dir.mkdir(parents=True, exist_ok=True)
    
    version = args.version or get_chromium_version()
    if not version:
        logger.error("Could not determine Chromium version. Please specify --version.")
        return

    logger.info(f"Preparing to download Chromium {version}...")
    
    base_url = "https://commondatastorage.googleapis.com/chromium-browser-official"
    filename = f"chromium-{version}.tar.xz"
    url = f"{base_url}/{filename}"
    
    dest_path = build_dir / filename
    
    if dest_path.exists():
        logger.info(f"File {filename} already exists. Skipping download.")
    else:
        logger.info(f"Downloading {url} to {dest_path}...")
        try:
            # Use curl for better progress bar and speed
            subprocess.run(['curl', '-L', '-o', str(dest_path), url], check=True)
        except Exception as e:
            logger.warning(f"Download failed: {e}")
            # Try lite version
            filename = f"chromium-{version}-lite.tar.xz"
            url = f"{base_url}/{filename}"
            dest_path = build_dir / filename
            logger.info(f"Trying lite version: {url}")
            try:
                 subprocess.run(['curl', '-L', '-o', str(dest_path), url], check=True)
            except Exception as e2:
                logger.error(f"Lite download failed too: {e2}")
                return

    # Extract
    src_dir = build_dir / 'src'
    if src_dir.exists():
        logger.info("Source directory 'src' already exists. Skipping extraction.")
    else:
        logger.info(f"Extracting {dest_path}...")
        try:
            # Use tar command for speed
            subprocess.run(['tar', '-xf', str(dest_path), '-C', str(build_dir)], check=True)
            
            # Find the extracted directory
            # It usually is chromium-{version}
            extracted_name = filename.replace('.tar.xz', '')
            extracted_path = build_dir / extracted_name
            
            if not extracted_path.exists():
                 # Fallback: find any directory starting with chromium-
                 dirs = [d for d in build_dir.iterdir() if d.is_dir() and d.name.startswith('chromium-')]
                 if dirs:
                     extracted_path = dirs[0]
            
            if extracted_path.exists():
                logger.info(f"Renaming {extracted_path.name} to src...")
                extracted_path.rename(src_dir)
            else:
                logger.error("Could not find extracted directory.")
                
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
