"""Generate default OpenClaw configuration for embedded Ocbot runtime."""

import json
import os
from pathlib import Path


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
            "allowInsecureAuth": True
        }
    }
}


def get_ocbot_config_dir():
    """Return the platform-specific OpenClaw config directory for Ocbot."""
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
