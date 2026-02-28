#!/usr/bin/env python3
import argparse
import sys
import subprocess
import os
import json
from pathlib import Path

try:
    from common import get_logger
    from download import download_source
    from patch import apply_patches, reset_source, update_patches
    from build import build_chromium
    from run import run_chromium
    from check import check_environment
    from icons import install_icons
    from package import package_dmg, package_windows
    from release import release_extension, release_browser
    from common import get_source_dir, get_project_root, get_agent_root
except ImportError as e:
    print(f"Error importing scripts: {e}")
    sys.exit(1)

def _build_extension(logger, zip=True):
    logger.info("Building extension...")
    extension_dir = get_agent_root()
    try:
        if not (extension_dir / 'node_modules').exists():
            logger.info("Installing extension dependencies...")
            subprocess.run(['npm', 'install'], cwd=extension_dir, check=True)
        subprocess.run(['npm', 'run', 'build'], cwd=extension_dir, check=True)
        if zip:
            logger.info("Packaging extension zip...")
            subprocess.run(['npm', 'run', 'zip'], cwd=extension_dir, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to build extension: {e}")
        sys.exit(1)
    except FileNotFoundError:
        logger.error("npm not found. Please install nodejs and npm.")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='ocbot development utility')
    
    # Parent parser for common arguments
    parent_parser = argparse.ArgumentParser(add_help=False)
    parent_parser.add_argument('--src-dir', help='Source directory (default: ../chromium/<version>)')

    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Check
    parser_check = subparsers.add_parser('check', help='Check environment and recommend download method', parents=[parent_parser])

    # Download
    parser_download = subparsers.add_parser('download', help='Download source code', parents=[parent_parser])
    parser_download.add_argument('--version', help='Version to download (tarball method only)')
    parser_download.add_argument('--method', choices=['tarball', 'depot', 'sync'], 
                                default='tarball',
                                help='Download method: tarball (quick) or depot (full dev) or sync (re-run gclient sync)')
    parser_download.add_argument('--no-history', action='store_true',
                                help='Fetch without git history (depot method only, reduces size)')

    # Patch
    parser_patch = subparsers.add_parser('patch', help='Apply patches', parents=[parent_parser])

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

    # Run
    parser_run = subparsers.add_parser('run', help='Run Ocbot', parents=[parent_parser])
    parser_run.add_argument('args', nargs=argparse.REMAINDER, help='Arguments to pass to Ocbot')
    parser_run.add_argument('--official', action='store_true', help='Run official build')
    parser_run.add_argument('--update-web', action='store_true', help='Build extension before running')

    # Update Web (build extension only)
    parser_update_web = subparsers.add_parser('update-web', help='Build ocbot extension only', parents=[parent_parser])
    parser_update_web.add_argument('--zip', action='store_true', help='Also create zip package (default: False for dev)')

    # Package
    parser_package = subparsers.add_parser('package', help='Package Ocbot.app into a .dmg installer', parents=[parent_parser])
    parser_package.add_argument('--output', help='Output DMG path (default: dist/<AppName>-<Version>.dmg)')
    parser_package.add_argument('--official', action='store_true', help='Package official build')
    parser_package.add_argument('--sign', help="Code signing identity (or set CODESIGN_IDENTITY)")
    parser_package.add_argument('--notarize', help="Notarization profile name (or set NOTARY_PROFILE)")
    parser_package.add_argument('--apple-id', help="Apple ID for notarization (or set APPLE_ID)")
    parser_package.add_argument('--team-id', help="Team ID for notarization (or set TEAM_ID)")
    parser_package.add_argument('--password-file', help="Path to file containing app-specific password", default=".apple.json")
    parser_package.add_argument('--extension-src', help="Path to extension build output to bundle in DMG (default: ocbot_agent/.output/chrome-mv3)")

    # Release Extension
    parser_release = subparsers.add_parser('release-extension', help='Release ocbot extension to GitHub', parents=[parent_parser])

    # Release Browser
    parser_release_browser = subparsers.add_parser('release-browser', help='Release ocbot browser DMG to GitHub', parents=[parent_parser])

    args = parser.parse_args()

    # Default extension source path
    if args.command == 'package' and not args.extension_src:
        args.extension_src = get_agent_root() / '.output' / 'chrome-mv3'

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

    if args.command == 'download':
        download_source(args)
    elif args.command == 'check':
        check_environment(args)
    elif args.command == 'patch':
        apply_patches(args)
    elif args.command == 'reset':
        reset_source(args)
    elif args.command == 'update_patches':
        update_patches(args)
    elif args.command == 'build':
        if args.src_dir:
            src_dir = Path(args.src_dir).resolve()
        else:
            src_dir = get_source_dir()
        
        if (src_dir / 'src').exists() and (src_dir / 'src').is_dir():
            src_dir = src_dir / 'src'

        # Install icons before build
        # Source: ocbot/icons
        # Dest: src/chrome/app/theme/chromium
        icons_src = get_project_root() / 'icons'
        icons_dest = src_dir / 'chrome' / 'app' / 'theme' / 'chromium'
        
        install_icons(icons_src, icons_dest)
        
        # Build extension
        _build_extension(logger, zip=True)

        build_chromium(args)
    elif args.command == 'run':
        if getattr(args, 'update_web', False):
             _build_extension(logger, zip=False)
        run_chromium(args)
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
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
