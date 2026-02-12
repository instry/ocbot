import os
import shutil
import subprocess
from pathlib import Path
from common import get_logger, get_project_root, get_source_dir


def get_chromium_version():
    """Read Chromium version from resources/chromium_version.txt"""
    from common import get_chromium_version as common_get_version
    return common_get_version()


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
    
    # Check if already initialized
    try:
        # Running --version is usually fast if already initialized
        result = subprocess.run(['gclient', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info(f"depot_tools is ready ({result.stdout.strip()})")
            return True
    except Exception:
        # Ignore error here and proceed to explicit initialization
        pass

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


def download_with_depot_tools(args, src_dir):
    """Download Chromium source using depot_tools (fetch + gclient sync)"""
    logger = get_logger()
    
    if not init_depot_tools():
        return False
    
    # Check if already fetched
    if src_dir.exists() and (src_dir / '.git').exists():
        logger.info("Chromium source already fetched. Running gclient sync...")
        return sync_with_depot_tools(args, src_dir)
    
    logger.info("Downloading Chromium source using depot_tools...")
    logger.info("This will take a while (30GB+ source + dependencies)...")
    
    # Create and enter source directory
    src_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Preparing workspace at {src_dir}...")
    os.chdir(src_dir)
    
    # Depot Tools mode enforces 'src' subdirectory
    logger.warning("Depot Tools mode enforces 'src' subdirectory.")
    logger.warning(f"Actual source will be in: {src_dir}/src")
    
    # Build fetch command
    fetch_cmd = ['fetch', '--nohooks', 'chromium']
    
    if args.no_history:
        fetch_cmd.insert(1, '--no-history')
        logger.info("Using --no-history to reduce download size")
    
    logger.info(f"Running: {' '.join(fetch_cmd)}")
    
    try:
        # Check if we are already in a gclient checkout
        if (Path('.gclient').exists()):
             logger.warning("Already inside a gclient checkout. Skipping fetch.")
        else:
            result = subprocess.run(fetch_cmd, check=False)
            if result.returncode != 0:
                # If fetch fails, it might be because the directory is not empty or partially initialized
                # But sometimes fetch returns non-zero even if it did something useful or if we are re-running
                logger.error("fetch command failed. If you are resuming, this might be expected.")
                # We continue to sync regardless, as that's how we resume
    except Exception as e:
        logger.error(f"fetch failed: {e}")
        return False
    
    # Now run gclient sync to get dependencies
    # Even if fetch failed (or was skipped because of existing checkout), 
    # we should try to sync, but only if .gclient exists or src/ exists
    if not (src_dir / '.gclient').exists() and not (src_dir / 'src').exists():
         logger.error("Source directory not found (no .gclient or src/). Please run fetch first or ensure directory is clean.")
         return False

    return sync_with_depot_tools(args, src_dir)


def sync_with_depot_tools(args, build_dir):
    """Sync dependencies using gclient sync"""
    logger = get_logger()
    src_dir = build_dir / 'src'
    
    # Check if .gclient exists in build_dir
    if not (build_dir / '.gclient').exists() and not src_dir.exists():
        logger.error("Source directory not found. Please run fetch first.")
        return False
    
    os.chdir(build_dir)
    
    logger.info("Running gclient sync to download dependencies...")
    logger.info("This downloads hundreds of third-party libraries (DEPS file)...")
    
    sync_cmd = ['gclient', 'sync']
    
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
    
    return True


def download_tarball(args, target_dir):
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
    
    # Prepare target directory
    # If target_dir is 'chromium-123', we want contents DIRECTLY inside it
    target_dir.mkdir(parents=True, exist_ok=True)
    
    dest_path = target_dir.parent / filename
    
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
            dest_path = target_dir.parent / filename
            logger.info(f"Trying lite version: {url}")
            try:
                subprocess.run(['curl', '-L', '-o', str(dest_path), url], check=True)
                logger.info("✓ Lite version download completed")
            except Exception as e2:
                logger.error(f"Lite download failed too: {e2}")
                return False
    
    # Extract
    # Check if target dir is empty or looks like source
    if (target_dir / 'chrome').exists():
        logger.info(f"Target directory {target_dir} seems to already contain source. Skipping extraction.")
    else:
        logger.info(f"Extracting {dest_path}...")
        logger.info("This may take several minutes...")
        try:
            # Tarball contains a root folder 'chromium-VERSION'
            # We extract to parent of target_dir
            subprocess.run(['tar', '-xf', str(dest_path), '-C', str(target_dir.parent)], check=True)
            
            # Identify the extracted folder name
            extracted_name = filename.replace('.tar.xz', '')
            extracted_path = target_dir.parent / extracted_name
            
            # If the extracted folder is different from target_dir, rename/move
            if extracted_path != target_dir and extracted_path.exists():
                logger.info(f"Moving contents to {target_dir}...")
                
                # If target dir is empty, we can just rename
                try:
                    # Remove empty target dir if created
                    target_dir.rmdir() 
                    extracted_path.rename(target_dir)
                except OSError:
                    # Fallback if target dir not empty or other error
                    # shutil.move(str(extracted_path), str(target_dir))
                    logger.warning(f"Could not rename {extracted_path} to {target_dir}. It might already exist.")
                
                logger.info("✓ Extraction completed")
            elif extracted_path.exists():
                 logger.info("✓ Extraction completed (matched target name)")
            else:
                logger.error(f"Could not find extracted directory {extracted_name}")
                return False
                
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            return False
    
    logger.info(f"✓ Source code ready at: {target_dir}")
    logger.warning("Note: Tarball method does NOT include third-party dependencies!")
    
    return True


def download_source(args):
    """Main download function - supports both methods"""
    logger = get_logger()
    
    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        # Default: sibling directory with version
        src_dir = get_source_dir(args.version)
        
    logger.info(f"Target Source Directory: {src_dir}")
    
    # Determine download method
    method = getattr(args, 'method', 'tarball')
    
    if method == 'depot':
        return download_with_depot_tools(args, src_dir)
    elif method == 'tarball':
        return download_tarball(args, src_dir)
    elif method == 'sync':
        return sync_with_depot_tools(args, src_dir)
    else:
        logger.error(f"Unknown download method: {method}")
        return False
