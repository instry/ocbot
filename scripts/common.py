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

def get_build_dir():
    return get_project_root() / 'build'

def get_source_dir():
    return get_build_dir() / 'src'
