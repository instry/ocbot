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
    """Read version from resources/chromium_version.txt"""
    version_file = get_project_root() / 'resources' / 'chromium_version.txt'
    if version_file.exists():
        return version_file.read_text().strip()
    return None

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
