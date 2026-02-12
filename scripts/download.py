import os
import shutil
import subprocess
from pathlib import Path
from common import get_logger, get_build_dir, get_project_root


def get_chromium_version():
    """Read Chromium version from resources/chromium_version.txt"""
    version_file = get_project_root() / 'resources' / 'chromium_version.txt'
    if version_file.exists():
        return version_file.read_text().strip()
    return None


def check_depot_tools():
    """Check if depot_tools is available in PATH"""
    return shutil.which('fetch') is not None and shutil.which('gclient') is not None


def init_depot_tools():
    """Initialize depot_tools by running gclient once"""
    logger = get_logger()
    
    if not check_depot_tools():
        logger.error("depot_tools not found in PATH!")
        logger.info("Please install depot_tools first:")
        logger.info("  git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git")
        logger.info("  export PATH=\"$PATH:/path/to/depot_tools\"")
        return False
    
    # Run gclient once to initialize
    logger.info("Initializing depot_tools...")
    try:
        result = subprocess.run(['gclient'], capture_output=True, text=True)
        if result.returncode == 0 or 'Usage:' in result.stderr:
            logger.info("depot_tools initialized successfully")
            return True
    except Exception as e:
        logger.error(f"Failed to initialize depot_tools: {e}")
    
    return False


def download_with_depot_tools(args, build_dir):
    """Download Chromium source using depot_tools (fetch + gclient sync)"""
    logger = get_logger()
    
    if not init_depot_tools():
        return False
    
    src_dir = build_dir / 'src'
    
    # Check if already fetched
    if src_dir.exists() and (src_dir / '.git').exists():
        logger.info("Chromium source already fetched. Running gclient sync...")
        return sync_with_depot_tools(args, build_dir)
    
    logger.info("Downloading Chromium source using depot_tools...")
    logger.info("This will take a while (30GB+ source + dependencies)...")
    
    # Change to build directory
    os.chdir(build_dir)
    
    # Build fetch command
    fetch_cmd = ['fetch', '--nohooks', 'chromium']
    
    if args.no_history:
        fetch_cmd.insert(1, '--no-history')
        logger.info("Using --no-history to reduce download size")
    
    logger.info(f"Running: {' '.join(fetch_cmd)}")
    
    try:
        result = subprocess.run(fetch_cmd, check=False)
        if result.returncode != 0:
            logger.error("fetch command failed")
            return False
    except Exception as e:
        logger.error(f"fetch failed: {e}")
        return False
    
    # Now run gclient sync to get dependencies
    return sync_with_depot_tools(args, build_dir)


def sync_with_depot_tools(args, build_dir):
    """Sync dependencies using gclient sync"""
    logger = get_logger()
    src_dir = build_dir / 'src'
    
    if not src_dir.exists():
        logger.error("Source directory not found. Please run fetch first.")
        return False
    
    os.chdir(build_dir)
    
    logger.info("Running gclient sync to download dependencies...")
    logger.info("This downloads hundreds of third-party libraries (DEPS file)...")
    
    sync_cmd = ['gclient', 'sync']
    
    if args.without_android:
        sync_cmd.extend(['--disable-syntax-validation', '-D', 'checkout_android=False'])
    
    try:
        result = subprocess.run(sync_cmd, check=False)
        if result.returncode != 0:
            logger.error("gclient sync failed")
            return False
    except Exception as e:
        logger.error(f"gclient sync failed: {e}")
        return False
    
    logger.info("✓ Source code and dependencies downloaded successfully!")
    logger.info(f"Location: {src_dir}")
    logger.info(f"Size: Run 'du -sh {src_dir}' to check")
    
    return True


def download_tarball(args, build_dir):
    """Download Chromium source as tarball (quick method)"""
    logger = get_logger()
    
    version = args.version or get_chromium_version()
    if not version:
        logger.error("Could not determine Chromium version. Please specify --version.")
        return False
    
    logger.info(f"Preparing to download Chromium {version} (tarball method)...")
    
    base_url = "https://commondatastorage.googleapis.com/chromium-browser-official"
    filename = f"chromium-{version}.tar.xz"
    url = f"{base_url}/{filename}"
    
    dest_path = build_dir / filename
    
    if dest_path.exists():
        logger.info(f"File {filename} already exists. Skipping download.")
    else:
        logger.info(f"Downloading {url}...")
        logger.info("File size: ~1-2GB, this may take 10-30 minutes...")
        try:
            subprocess.run(['curl', '-L', '-o', str(dest_path), url], check=True)
            logger.info("✓ Download completed")
        except Exception as e:
            logger.warning(f"Download failed: {e}")
            # Try lite version
            filename = f"chromium-{version}-lite.tar.xz"
            url = f"{base_url}/{filename}"
            dest_path = build_dir / filename
            logger.info(f"Trying lite version: {url}")
            try:
                subprocess.run(['curl', '-L', '-o', str(dest_path), url], check=True)
                logger.info("✓ Lite version download completed")
            except Exception as e2:
                logger.error(f"Lite download failed too: {e2}")
                return False
    
    # Extract
    src_dir = build_dir / 'src'
    if src_dir.exists():
        logger.info("Source directory 'src' already exists. Skipping extraction.")
    else:
        logger.info(f"Extracting {dest_path}...")
        logger.info("This may take several minutes...")
        try:
            subprocess.run(['tar', '-xf', str(dest_path), '-C', str(build_dir)], check=True)
            
            # Find and rename extracted directory
            extracted_name = filename.replace('.tar.xz', '')
            extracted_path = build_dir / extracted_name
            
            if not extracted_path.exists():
                dirs = [d for d in build_dir.iterdir() 
                       if d.is_dir() and d.name.startswith('chromium-') and d.name != 'src']
                if dirs:
                    extracted_path = dirs[0]
            
            if extracted_path.exists():
                logger.info(f"Renaming {extracted_path.name} to src...")
                extracted_path.rename(src_dir)
                logger.info("✓ Extraction completed")
            else:
                logger.error("Could not find extracted directory.")
                return False
                
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            return False
    
    logger.info(f"✓ Source code ready at: {src_dir}")
    logger.warning("Note: Tarball method does NOT include third-party dependencies!")
    logger.warning("For full development, use: ./scripts/dev.py download --method depot")
    
    return True


def download_source(args):
    """Main download function - supports both methods"""
    logger = get_logger()
    build_dir = get_build_dir()
    build_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine download method
    method = getattr(args, 'method', 'tarball')
    
    if method == 'depot':
        return download_with_depot_tools(args, build_dir)
    elif method == 'tarball':
        return download_tarball(args, build_dir)
    elif method == 'sync':
        return sync_with_depot_tools(args, build_dir)
    else:
        logger.error(f"Unknown download method: {method}")
        logger.info("Valid methods: tarball, depot, sync")
        return False
