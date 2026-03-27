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
    full product version string (e.g. 26.3.9).
    """
    product_version = get_product_version()
    version_map = get_version_map()
    entry = version_map.get(product_version)
    if entry:
        return entry['chromium']
    return None

def get_openclaw_version():
    """Look up the OpenClaw version from version_map.json using the product version."""
    product_version = get_product_version()
    version_map = get_version_map()
    entry = version_map.get(product_version)
    if entry:
        return entry.get('openclaw')
    return None

def get_patches_dir():
    """
    Get the directory containing patches based on the Chromium major version.
    Derives major from the chromium version string and returns ocbot/patches/vXXX.
    Returns the path even if the directory does not yet exist.
    """
    chromium_version = get_chromium_version()
    if chromium_version:
        major = chromium_version.split('.')[0]
    else:
        major = get_product_version().split('.')[0]
    return get_project_root() / 'chromium' / 'patches' / f"v{major}"

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

def get_chromium_root():
    """Returns the chromium workspace: <workspace>/chromium/"""
    return get_project_root().parent / 'chromium'

def get_main_repo():
    """Returns the main depot_tools checkout: chromium/main/"""
    return get_chromium_root() / 'main'

def get_agent_root():
    """Returns the root of the web extension project (inside ocbot)."""
    return get_project_root() / 'web'

def sync_extension_version():
    """Sync VERSION into web/wxt.config.ts."""
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

def get_out_dir_name(is_official, arch=None):
    """Return output directory name, e.g. 'Official-arm64' or 'Default'."""
    base = 'Official' if is_official else 'Default'
    return f'{base}-{arch}' if arch else base


def get_source_dir(version=None):
    """
    Returns the source directory for the active version.
    Priority: v{major}/src → main/src → legacy <full-version>/src
    """
    if version is None:
        version = get_chromium_version()
    if version:
        major = version.split('.')[0]
        wt = get_chromium_root() / f'v{major}' / 'src'
        if wt.exists():
            return wt
    main = get_main_repo() / 'src'
    if main.exists():
        return main
    # Legacy fallback for old-style directories
    if version:
        legacy = get_chromium_root() / version / 'src'
        if legacy.exists():
            return legacy
        legacy2 = get_chromium_root() / version
        if legacy2.exists():
            return legacy2
    return get_chromium_root() / 'src'
