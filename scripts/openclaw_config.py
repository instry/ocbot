"""Generate default OpenClaw configuration for embedded Ocbot runtime."""

import json
import os
from pathlib import Path


def resolve_runtime_mode():
    raw = os.environ.get('OCBOT_RUNTIME_MODE', '').strip().lower()
    if raw in ('prod', 'production', 'release'):
        return 'prod'
    return 'dev'


def get_ocbot_app_data_dir():
    if os.name == 'nt':
        return Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming')) / 'Ocbot'
    if os.name == 'posix' and os.uname().sysname == 'Darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Ocbot'
    return Path.home() / '.config' / 'ocbot'


def get_ocbot_openclaw_data_dir(mode=None):
    runtime_mode = mode or resolve_runtime_mode()
    dirname = 'openclaw' if runtime_mode == 'prod' else 'openclaw-dev'
    return get_ocbot_app_data_dir() / dirname


def get_ocbot_config_dir(mode=None):
    return get_ocbot_openclaw_data_dir(mode) / 'config'


def get_ocbot_state_dir(mode=None):
    return get_ocbot_openclaw_data_dir(mode) / 'state'


def get_ocbot_workspace_dir(mode=None):
    return get_ocbot_openclaw_data_dir(mode) / 'workspace'


def build_default_config(workspace_dir: Path):
    return {
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
        },
        "agents": {
            "defaults": {
                "workspace": str(workspace_dir)
            }
        }
    }


def ensure_ocbot_openclaw_config(config_dir=None, workspace_dir=None):
    """
    Ensure a default openclaw.json exists in the given config directory.
    Does not overwrite if the file already exists (user may have customized it).
    Returns the path to the config file.
    """
    runtime_mode = resolve_runtime_mode()
    if config_dir is None:
        config_dir = get_ocbot_config_dir(runtime_mode)
    else:
        config_dir = Path(config_dir)
    if workspace_dir is None:
        workspace_dir = get_ocbot_workspace_dir(runtime_mode)
    else:
        workspace_dir = Path(workspace_dir)

    config_dir.mkdir(parents=True, exist_ok=True)
    workspace_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / 'openclaw.json'

    if not config_file.exists():
        with open(config_file, 'w') as f:
            json.dump(build_default_config(workspace_dir), f, indent=2)
    else:
        with open(config_file, 'r') as f:
            config = json.load(f)
        config.setdefault('agents', {})
        config['agents'].setdefault('defaults', {})
        if config['agents']['defaults'].get('workspace') != str(workspace_dir):
            config['agents']['defaults']['workspace'] = str(workspace_dir)
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)

    return config_file
