#!/usr/bin/env python3
import argparse
import sys
import subprocess
from pathlib import Path

try:
    from common import get_logger
    from download import download_source
    from patch import apply_patches, reset_source, update_patches
    from build import build_chromium
    from run import run_chromium
    from check import check_environment
    from icons import install_icons
    from package import package_dmg
    from common import get_source_dir, get_project_root
except ImportError as e:
    print(f"Error importing scripts: {e}")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='ocbot development utility')
    
    # Parent parser for common arguments
    parent_parser = argparse.ArgumentParser(add_help=False)
    parent_parser.add_argument('--src-dir', help='Chromium source directory (default: ../chromium/<version>)')

    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Check
    parser_check = subparsers.add_parser('check', help='Check environment and recommend download method', parents=[parent_parser])

    # Download
    parser_download = subparsers.add_parser('download', help='Download Chromium source', parents=[parent_parser])
    parser_download.add_argument('--version', help='Chromium version to download (tarball method only)')
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

    # Build
    parser_build = subparsers.add_parser('build', help='Build Chromium', parents=[parent_parser])
    parser_build.add_argument('--target', default='chrome', help='Build target')

    # Run
    parser_run = subparsers.add_parser('run', help='Run Chromium with extension loaded', parents=[parent_parser])
    parser_run.add_argument('args', nargs=argparse.REMAINDER, help='Arguments to pass to Chromium')

    # Package
    parser_package = subparsers.add_parser('package', help='Package Ocbot.app into a .dmg installer', parents=[parent_parser])
    parser_package.add_argument('--output', help='Output DMG path (default: dist/<AppName>-<Version>.dmg)')

    args = parser.parse_args()
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
        logger.info("Building and packaging extension...")
        extension_dir = get_project_root() / 'extension'
        try:
            subprocess.run(['npm', 'run', 'build'], cwd=extension_dir, check=True)
            subprocess.run(['npm', 'run', 'zip'], cwd=extension_dir, check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to build extension: {e}")
            sys.exit(1)
        except FileNotFoundError:
             logger.error("npm not found. Please install nodejs and npm.")
             sys.exit(1)

        build_chromium(args)
    elif args.command == 'run':
        run_chromium(args)
    elif args.command == 'package':
        package_dmg(args)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
