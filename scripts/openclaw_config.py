"""Generate default OpenClaw configuration for embedded Ocbot runtime."""

import json
import os
from pathlib import Path

from common import get_project_root


DEFAULT_CONFIG = {
    "browser": {
        "profiles": {
            "ocbot": {
                "cdpUrl": "http://127.0.0.1:9222",
                "attachOnly": True,
                "driver": "openclaw",
                "color": "#7c3aed"
            }
        },
        "defaultProfile": "ocbot"
    },
    "gateway": {
        "port": 18789,
        "mode": "local",
        "bind": "loopback",
        "auth": {
            "mode": "none"
        },
        "controlUi": {
            "allowedOrigins": ["*"],
            "allowInsecureAuth": True,
            "dangerouslyDisableDeviceAuth": True
        }
    }
}


def get_ocbot_config_dir():
    """Return the OpenClaw config directory for Ocbot.

    In dev mode (running from source), uses <project_root>/.openclaw/.
    In production, uses the platform-specific application data directory.
    """
    # Dev mode: use project-local directory
    if os.environ.get('OCBOT_DEV'):
        return get_project_root() / '.openclaw'

    if os.name == 'nt':
        base = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
        return base / 'Ocbot' / 'openclaw-config'
    elif os.name == 'posix' and os.uname().sysname == 'Darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Ocbot' / 'openclaw-config'
    else:
        return Path.home() / '.config' / 'ocbot' / 'openclaw-config'


def ensure_ocbot_openclaw_config(config_dir=None):
    """
    Ensure a default openclaw.json exists in the given config directory.
    Does not overwrite if the file already exists (user may have customized it).
    Returns the path to the config file.
    """
    if config_dir is None:
        config_dir = get_ocbot_config_dir()
    else:
        config_dir = Path(config_dir)

    config_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / 'openclaw.json'

    if not config_file.exists():
        with open(config_file, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)

    return config_file
