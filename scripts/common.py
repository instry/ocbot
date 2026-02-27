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
    Look up the full Chromium version from version_map.json using the
    major version extracted from the product VERSION file (e.g. 144.1.0 -> 144).
    """
    product_version = get_product_version()
    major = product_version.split('.')[0]
    version_map = get_version_map()
    entry = version_map.get(major)
    if entry:
        return entry['chromium']
    return None

def get_patches_dir():
    """
    Get the directory containing patches based on the product version.
    Extracts major version from VERSION file and returns ocbot/patches/vXXX.
    Returns the path even if the directory does not yet exist.
    """
    product_version = get_product_version()
    major = product_version.split('.')[0]
    return get_project_root() / 'patches' / f"v{major}"

def get_product_version():
    """Read product version from VERSION file."""
    version_file = get_project_root() / 'VERSION'
    return version_file.read_text().strip()

def get_version_map():
    """Read version mapping table."""
    import json
    map_file = get_project_root() / 'version_map.json'
    with open(map_file) as f:
        return json.load(f)

def get_agent_root():
    """Returns the root of the ocbot_agent project (submodule inside ocbot)."""
    return get_project_root() / 'ocbot_agent'

def sync_extension_version():
    """Sync VERSION into ocbot_agent/wxt.config.ts."""
    import re
    version = get_product_version()
    config_path = get_agent_root() / 'wxt.config.ts'
    content = config_path.read_text()
    updated = re.sub(
        r"(version:\s*['\"])[^'\"]+(['\"])",
        rf"\g<1>{version}\2",
        content
    )
    config_path.write_text(updated)

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
