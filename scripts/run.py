import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root, get_agent_root
from openclaw_config import (
    ensure_ocbot_openclaw_config,
    get_ocbot_config_dir,
    get_ocbot_state_dir,
    get_ocbot_workspace_dir,
)


def _sync_extension(logger, out_dir):
    """Copy latest extension build into the app bundle or build output directory."""
    extension_src = get_agent_root() / '.output' / 'chrome-mv3'
    if not extension_src.exists():
        logger.warning(f"Extension build output not found: {extension_src}")
        return

    if sys.platform == 'win32':
        # Windows: DIR_RESOURCES resolves to <exe_dir>/resources/
        dest = out_dir / 'resources' / 'ocbot'
    else:
        # macOS: extension goes into Framework Resources
        app_dir = out_dir / 'Ocbot.app'
        frameworks_dir = app_dir / 'Contents' / 'Frameworks'
        if not frameworks_dir.exists():
            return

        framework = None
        for item in frameworks_dir.iterdir():
            if item.name.endswith('.framework'):
                framework = item
                break

        if not framework:
            return

        dest = framework / 'Resources' / 'ocbot'

    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(extension_src, dest)
    logger.info(f"Extension synced to {dest}")


def _find_embedded_runtime(out_dir):
    """Locate embedded Node.js and OpenClaw in app bundle. Returns (node_path, openclaw_dir) or (None, None)."""
    if sys.platform == 'win32':
        resources = out_dir / 'resources'
        node_path = resources / 'node.exe'
        openclaw_dir = resources / 'openclaw'
    else:
        app_dir = out_dir / 'Ocbot.app'
        frameworks_dir = app_dir / 'Contents' / 'Frameworks'
        if not frameworks_dir.exists():
            return None, None

        framework = None
        for item in frameworks_dir.iterdir():
            if item.name.endswith('.framework'):
                framework = item
                break
        if not framework:
            return None, None

        resources = framework / 'Resources'
        node_path = resources / 'node'
        openclaw_dir = resources / 'openclaw'

    if node_path.exists() and openclaw_dir.exists():
        return node_path, openclaw_dir
    return None, None


def _wait_for_gateway(logger, port=18789, timeout=15):
    """Wait for OpenClaw gateway to become ready on the given port."""
    url = f'http://127.0.0.1:{port}/'
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                # Any response means the server is up
                logger.info(f"OpenClaw gateway ready on port {port}")
                return True
        except Exception as e:
            last_error = e
        time.sleep(0.5)
    # Gateway may return errors but still be listening - check with socket
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            logger.info(f"OpenClaw gateway ready on port {port} (socket check)")
            return True
    except Exception:
        pass
    logger.error(f"Timed out waiting for OpenClaw gateway on port {port}: {last_error}")
    return False


def _start_embedded_runtime(logger, out_dir):
    """Start embedded OpenClaw gateway. Returns subprocess or exits on failure."""
    node_path, openclaw_dir = _find_embedded_runtime(out_dir)
    if not node_path:
        return None

    logger.info("Found embedded runtime, starting OpenClaw gateway...")

    os.environ.setdefault('OCBOT_RUNTIME_MODE', 'dev')
    config_dir = get_ocbot_config_dir()
    state_dir = get_ocbot_state_dir()
    workspace_dir = get_ocbot_workspace_dir()
    config_file = ensure_ocbot_openclaw_config(config_dir, workspace_dir)
    state_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env['OPENCLAW_CONFIG_PATH'] = str(config_file)
    env['OPENCLAW_STATE_DIR'] = str(state_dir)
    env['OPENCLAW_NO_RESPAWN'] = '1'

    # Tell openclaw where bundled plugins live (embedded runtime has no .git/src,
    # so the source-checkout heuristic doesn't fire).
    extensions_dir = openclaw_dir / 'extensions'
    if extensions_dir.exists():
        env['OPENCLAW_BUNDLED_PLUGINS_DIR'] = str(extensions_dir)

    gateway_cmd = [
        str(node_path),
        str(openclaw_dir / 'openclaw.mjs'),
        'gateway', 'run',
        '--port', '18789',
        '--bind', 'loopback',
        '--force',
    ]

    logger.info(f"Gateway command: {' '.join(gateway_cmd)}")

    try:
        proc = subprocess.Popen(
            gateway_cmd,
            env=env,
            stdout=None,   # inherit terminal so logs are visible
            stderr=None,
        )
    except Exception as e:
        logger.error(f"Failed to start embedded OpenClaw: {e}")
        sys.exit(1)

    # Wait for gateway to be ready; abort if it crashed or timed out.
    if not _wait_for_gateway(logger):
        # Check if process already died
        exit_code = proc.poll()
        if exit_code is not None:
            logger.error(f"OpenClaw gateway exited with code {exit_code}. Check config: {config_file}")
        else:
            logger.error("OpenClaw gateway did not become ready (timed out)")
            proc.terminate()
        sys.exit(1)

    return proc


def run_ocbot(src_dir=None, official=False, extra_args=None, update_web=False):
    """Start embedded OpenClaw gateway and launch Ocbot browser.

    Args:
        src_dir: Chromium source directory (auto-detected if None).
        official: Use Official build output instead of Default.
        extra_args: Additional command-line arguments for the browser.
        update_web: Build extension before running.
    """
    logger = get_logger()

    if src_dir is None:
        src_dir = get_source_dir()
    else:
        src_dir = Path(src_dir)

    if not src_dir:
        logger.error("Could not find source directory.")
        return

    out_dir_name = 'Official' if official else 'Default'
    out_dir = src_dir / 'out' / out_dir_name

    # --- Locate browser executable ---
    if sys.platform == 'win32':
        executable = out_dir / 'ocbot.exe'
        if not executable.exists():
            executable = out_dir / 'chrome.exe'
    else:
        executable = out_dir / 'Ocbot.app' / 'Contents' / 'MacOS' / 'Ocbot'

    if not executable.exists():
        if sys.platform == 'win32':
            logger.error(f"Executable not found at {out_dir / 'ocbot.exe'} or {out_dir / 'chrome.exe'}")
        else:
            logger.error(f"Ocbot.app not found at {out_dir / 'Ocbot.app'}")
        logger.info("Please build first: python ocbot/scripts/dev.py build")
        return

    # --- Start embedded gateway ---
    node_path, openclaw_dir = _find_embedded_runtime(out_dir)
    if not node_path:
        logger.error("No embedded runtime found. Run 'dev.py build' first.")
        return

    logger.info('Starting embedded OpenClaw gateway...')
    gateway_proc = _start_embedded_runtime(logger, out_dir)

    # --- Build browser command ---
    cmd = [str(executable)]

    _sync_extension(logger, out_dir)

    extension_dev_path = get_agent_root() / '.output' / 'chrome-mv3'
    if extension_dev_path.exists():
        cmd.append(f'--ocbot-extension-dir={extension_dev_path}')

    cmd.append('--remote-debugging-port=9222')

    if extra_args:
        cmd.extend(extra_args)

    # Default dev profile
    has_user_data_dir = any(a.startswith('--user-data-dir') for a in cmd)
    if not has_user_data_dir:
        dev_profile = Path(tempfile.gettempdir()) / "ocbot-dev-profile"
        dev_profile.mkdir(parents=True, exist_ok=True)
        cmd.append(f"--user-data-dir={dev_profile}")
        logger.info(f"Using dev profile: {dev_profile}")

    logger.info(f"Launching Ocbot...")
    logger.info(f"Command: {' '.join(cmd)}")

    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        logger.info('Stopping Ocbot...')
    finally:
        if gateway_proc and gateway_proc.poll() is None:
            logger.info('Stopping embedded OpenClaw gateway...')
            gateway_proc.terminate()
            try:
                gateway_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                gateway_proc.kill()
