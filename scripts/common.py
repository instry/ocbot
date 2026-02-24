import logging
import sys
from pathlib import Path

# Constants
ENCODING = 'UTF-8'
LOGGER_NAME = 'ocbot'

def get_logger(initial_level=logging.INFO):
    logger = logging.getLogger(LOGGER_NAME)
    if logger.level == logging.NOTSET:
        logger.setLevel(initial_level)
        if not logger.hasHandlers():
            console_handler = logging.StreamHandler()
            console_handler.setLevel(initial_level)
            formatter = logging.Formatter('%(levelname)s: %(message)s')
            console_handler.setFormatter(formatter)
            logger.addHandler(console_handler)
    return logger

def get_project_root():
    """Returns the root of the ocbot project (the directory containing dev.py)"""
    # ocbot/scripts/common.py -> ocbot/
    return Path(__file__).resolve().parent.parent

def get_chromium_version():
    """
    Detect version from patches/v*/chromium_version.txt.
    Expects version directories like v144, v145.
    If multiple found, returns the latest (lexicographically).
    """
    patches_dir = get_project_root() / 'patches'
    if not patches_dir.exists():
        return None
        
    # Find all v* directories
    version_dirs = [d for d in patches_dir.iterdir() if d.is_dir() and d.name.startswith('v')]
    
    if not version_dirs:
        return None
        
    # Sort by version number (e.g. v144 < v145)
    # Simple string sort works for v100+
    version_dirs.sort(key=lambda x: x.name)
    
    latest_dir = version_dirs[-1]
    version_file = latest_dir / 'chromium_version.txt'
    
    if version_file.exists():
        return version_file.read_text().strip()
    
    return None

def get_patches_dir(version=None):
    """
    Get the directory containing patches for the given version.
    If version is None, detects the latest version.
    Returns path like ocbot/patches/v144
    """
    if not version:
        version = get_chromium_version()
        
    if not version:
        return None
        
    major_version = version.split('.')[0]
    patches_dir = get_project_root() / 'patches' / f"v{major_version}"
    return patches_dir if patches_dir.exists() else None

def get_source_dir(version=None):
    """
    Returns the source directory.
    Default: sibling directory of ocbot project, structure: ../chromium/<version>
    Example: ../chromium/130.0.6723.69
    """
    if version is None:
        version = get_chromium_version()
    
    if version:
        # ocbot/../chromium/{version}
        return get_project_root().parent / 'chromium' / version
    else:
        # Fallback if no version found
        return get_project_root().parent / 'chromium' / 'src'
