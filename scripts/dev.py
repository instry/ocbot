#!/usr/bin/env python3
import argparse
import sys
import subprocess
import os
import json
import time
import urllib.request
from pathlib import Path

try:
    from common import get_logger
    from download import init_chromium, create_worktree, list_worktrees, remove_worktree, sync_worktree
    from patch import apply_patches, reset_source, update_patches, repatch_source
    from build import build_chromium
    from run import run_chromium
    from check import check_environment
    from icons import install_icons
    from package import package_dmg, package_windows
    from release import release_extension, release_browser, upload_config_to_r2
    from common import get_source_dir, get_project_root, get_agent_root
except ImportError as e:
    print(f"Error importing scripts: {e}")
    sys.exit(1)

def _build_extension(logger, zip=True):
    logger.info("Building extension...")
    extension_dir = get_agent_root()
    _shell = sys.platform == 'win32'
    try:
        if not (extension_dir / 'node_modules').exists():
            logger.info("Installing extension dependencies...")
            subprocess.run(['npm', 'install'], cwd=extension_dir, check=True, shell=_shell)
        subprocess.run(['npm', 'run', 'build'], cwd=extension_dir, check=True, shell=_shell)
        if zip:
            logger.info("Packaging extension zip...")
            subprocess.run(['npm', 'run', 'zip'], cwd=extension_dir, check=True, shell=_shell)
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to build extension: {e}")
        sys.exit(1)
    except FileNotFoundError:
        logger.error("npm not found. Please install nodejs and npm.")
        sys.exit(1)


def _wait_for_cdp(logger, url='http://127.0.0.1:9222/json/version', timeout=15):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    logger.info(f"CDP is ready: {url}")
                    return True
        except Exception as e:
            last_error = e
        time.sleep(0.5)

    logger.error(f"Timed out waiting for CDP at {url}: {last_error}")
    return False


def _run_full(args, logger):
    script_path = Path(__file__).resolve()
    run_cmd = [sys.executable, str(script_path), 'run']
    if getattr(args, 'official', False):
        run_cmd.append('--official')
    if getattr(args, 'update_web', False):
        run_cmd.append('--update-web')
    if args.src_dir:
        run_cmd.extend(['--src-dir', args.src_dir])
    if getattr(args, 'args', None):
        run_cmd.extend(args.args)

    logger.info('Starting Ocbot...')
    ocbot_proc = subprocess.Popen(run_cmd)

    try:
        if not _wait_for_cdp(logger):
            ocbot_proc.terminate()
            sys.exit(1)

        openclaw_dir = get_project_root().parent / 'openclaw'
        if not openclaw_dir.exists():
            logger.error(f"OpenClaw directory not found: {openclaw_dir}")
            ocbot_proc.terminate()
            sys.exit(1)

        gateway_cmd = ['pnpm', 'gateway:dev']
        logger.info('Starting OpenClaw gateway...')
        logger.info(f"Command: {' '.join(gateway_cmd)}")
        gateway_proc = subprocess.Popen(gateway_cmd, cwd=openclaw_dir)

        logger.info('Ocbot + OpenClaw are running. Press Ctrl+C to stop both.')
        gateway_proc.wait()
    except KeyboardInterrupt:
        logger.info('Stopping Ocbot + OpenClaw...')
    finally:
        if ocbot_proc.poll() is None:
            ocbot_proc.terminate()
            try:
                ocbot_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                ocbot_proc.kill()

def main():
    parser = argparse.ArgumentParser(description='ocbot development utility')
    
    # Parent parser for common arguments
    parent_parser = argparse.ArgumentParser(add_help=False)
    parent_parser.add_argument('--src-dir', help='Source directory (default: ../chromium/<version>)')

    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Check
    parser_check = subparsers.add_parser('check', help='Check environment and recommend setup steps', parents=[parent_parser])

    # Init (first-time chromium fetch)
    parser_init = subparsers.add_parser('init', help='First-time Chromium setup (fetch to main/)', parents=[parent_parser])
    parser_init.add_argument('--no-history', action='store_true',
                             help='Fetch without git history (reduces download size)')

    # Worktree management
    parser_worktree = subparsers.add_parser('worktree', help='Manage version worktrees')
    worktree_sub = parser_worktree.add_subparsers(dest='worktree_command', help='Worktree sub-command')

    wt_create = worktree_sub.add_parser('create', help='Create a worktree for a Chromium version', parents=[parent_parser])
    wt_create.add_argument('--version', help='Full Chromium version (e.g. 144.0.7559.132)')

    wt_list = worktree_sub.add_parser('list', help='List all version worktrees', parents=[parent_parser])

    wt_remove = worktree_sub.add_parser('remove', help='Remove a version worktree', parents=[parent_parser])
    wt_remove.add_argument('major', help='Major version to remove (e.g. 144)')

    # Sync
    parser_sync = subparsers.add_parser('sync', help='Run gclient sync for a version worktree', parents=[parent_parser])
    parser_sync.add_argument('--version', help='Full Chromium version (default: from VERSION file)')

    # Patch
    parser_patch = subparsers.add_parser('patch', help='Apply patches', parents=[parent_parser])

    # Repatch (incremental)
    parser_repatch = subparsers.add_parser('repatch', help='Incrementally re-apply only changed patches (faster than reset+patch)', parents=[parent_parser])
    parser_repatch.add_argument('--base', help='Base commit/ref to reset files to (default: auto-detect)')

    # Reset (Revert patches)
    parser_reset = subparsers.add_parser('reset', help='Revert all patches', parents=[parent_parser])

    # Update Patches
    parser_update = subparsers.add_parser('update_patches', help='Update patches from modified source', parents=[parent_parser])
    parser_update.add_argument('--base', help='Base commit/ref to compare against (default: auto-detect)')

    # Build
    parser_build = subparsers.add_parser('build', help='Build Ocbot', parents=[parent_parser])
    parser_build.add_argument('--target', default='chrome', help='Build target')
    parser_build.add_argument('--official', action='store_true', help='Build official release (optimized)')
    parser_build.add_argument('--clean', action='store_true', help='Clean output directory before building')
    parser_build.add_argument('--arch', default=None,
        choices=['arm64', 'x64', 'universal'],
        help='Target architecture (default: native)')

    # Run
    parser_run = subparsers.add_parser('run', help='Run Ocbot', parents=[parent_parser])
    parser_run.add_argument('args', nargs=argparse.REMAINDER, help='Arguments to pass to Ocbot')
    parser_run.add_argument('--official', action='store_true', help='Run official build')
    parser_run.add_argument('--update-web', action='store_true', help='Build extension before running')

    # Run full stack
    parser_run_full = subparsers.add_parser('run_full', help='Run Ocbot with OpenClaw gateway', parents=[parent_parser])
    parser_run_full.add_argument('args', nargs=argparse.REMAINDER, help='Arguments to pass to Ocbot')
    parser_run_full.add_argument('--official', action='store_true', help='Run official build')
    parser_run_full.add_argument('--update-web', action='store_true', help='Build extension before running')

    # Update Web (build extension only)
    parser_update_web = subparsers.add_parser('update-web', help='Build ocbot extension only', parents=[parent_parser])
    parser_update_web.add_argument('--zip', action='store_true', help='Also create zip package (default: False for dev)')

    # Package
    parser_package = subparsers.add_parser('package', help='Package Ocbot into an installer (DMG/EXE)', parents=[parent_parser])
    parser_package.add_argument('--output', help='Output path (default: dist/<AppName>-<Version>.[dmg|zip])')
    parser_package.add_argument('--app-path', help='Path to pre-built .app bundle (skips search in out/)')
    parser_package.add_argument('--official', action='store_true', help='Package official build')
    parser_package.add_argument('--sign', help="Code signing identity (or set CODESIGN_IDENTITY)")
    parser_package.add_argument('--notarize', help="Notarization profile name (or set NOTARY_PROFILE)")
    parser_package.add_argument('--apple-id', help="Apple ID for notarization (or set APPLE_ID)")
    parser_package.add_argument('--team-id', help="Team ID for notarization (or set TEAM_ID)")
    parser_package.add_argument('--password', help="App-specific password for notarization (or set NOTARY_PASSWORD)")
    parser_package.add_argument('--password-file', help="Path to file containing app-specific password", default=".apple.json")
    parser_package.add_argument('--extension-src', help="Path to extension build output to bundle in DMG (default: web/.output/chrome-mv3)")
    parser_package.add_argument('--arch', default=None,
        choices=['arm64', 'x64', 'universal'],
        help='Architecture to package (default: native)')

    # Release Extension
    parser_release = subparsers.add_parser('release-extension', help='Release ocbot extension to GitHub', parents=[parent_parser])

    # Release Browser
    parser_release_browser = subparsers.add_parser('release-browser', help='Release ocbot browser DMG to GitHub', parents=[parent_parser])

    # Sync Models
    parser_sync_models = subparsers.add_parser('sync-models', help='Upload models.json to CDN', parents=[parent_parser])

    args = parser.parse_args()

    # Default extension source path
    if args.command == 'package' and not args.extension_src:
        args.extension_src = get_agent_root() / '.output' / 'chrome-mv3'

    # Set NOTARY_PASSWORD from --password if provided directly
    if hasattr(args, 'password') and args.password:
        os.environ['NOTARY_PASSWORD'] = args.password

    # Read password from file if applicable
    # Only read if --official is set or if the user explicitly provided a password file
    should_read_password_file = False
    if hasattr(args, 'password_file') and args.password_file:
        if args.password_file != ".apple.json":
             # User explicitly provided a file
             should_read_password_file = True
        elif getattr(args, 'official', False):
             # Default file, but only read if --official
             should_read_password_file = True
    
    if should_read_password_file:
        pw_file = Path(args.password_file)
        if not pw_file.is_absolute():
            # Try relative to CWD
            if not pw_file.exists():
                # Try relative to project root (ocbot/ocbot/scripts/../../)
                pw_file = get_project_root() / args.password_file
        
        if pw_file.exists():
            try:
                file_content = pw_file.read_text().strip()
                try:
                    data = json.loads(file_content)
                    if 'password' in data:
                        os.environ['NOTARY_PASSWORD'] = data['password']
                    if 'apple-id' in data and not args.apple_id:
                        args.apple_id = data['apple-id']
                    if 'team-id' in data and not args.team_id:
                        args.team_id = data['team-id']
                    if 'sign' in data and not args.sign:
                        args.sign = data['sign']
                except json.JSONDecodeError:
                    # Fallback to plain text
                    os.environ['NOTARY_PASSWORD'] = file_content
            except Exception as e:
                print(f"Error reading password file: {e}")
        else:
             # Just log debug if needed, but don't fail yet
             pass

    logger = get_logger()

    if args.command == 'init':
        init_chromium(args)
    elif args.command == 'worktree':
        if args.worktree_command == 'create':
            create_worktree(args)
        elif args.worktree_command == 'list':
            list_worktrees(args)
        elif args.worktree_command == 'remove':
            remove_worktree(args)
        else:
            parser.parse_args(['worktree', '--help'])
    elif args.command == 'sync':
        sync_worktree(args)
    elif args.command == 'check':
        check_environment(args)
    elif args.command == 'patch':
        apply_patches(args)
    elif args.command == 'repatch':
        repatch_source(args)
    elif args.command == 'reset':
        reset_source(args)
    elif args.command == 'update_patches':
        update_patches(args)
    elif args.command == 'build':
        if args.src_dir:
            src_dir = Path(args.src_dir).resolve()
        else:
            src_dir = get_source_dir()

        # Install icons before build
        # Source: ocbot/chromium/icons
        # Dest: src/chrome/app/theme/chromium
        icons_src = get_project_root() / 'chromium' / 'icons'
        icons_dest = src_dir / 'chrome' / 'app' / 'theme' / 'chromium'

        install_icons(icons_src, icons_dest)
        
        # Build extension
        _build_extension(logger, zip=True)

        build_chromium(args)
    elif args.command == 'run':
        if getattr(args, 'update_web', False):
             _build_extension(logger, zip=False)
        run_chromium(args)
    elif args.command == 'run_full':
        if getattr(args, 'update_web', False):
             _build_extension(logger, zip=False)
        _run_full(args, logger)
    elif args.command == 'update-web':
        _build_extension(logger, zip=getattr(args, 'zip', False))
    elif args.command == 'package':
        if sys.platform == 'win32':
            package_windows(args)
        else:
            package_dmg(args)
    elif args.command == 'release-extension':
        release_extension(args)
    elif args.command == 'release-browser':
        release_browser(args)
    elif args.command == 'sync-models':
        upload_config_to_r2()
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
