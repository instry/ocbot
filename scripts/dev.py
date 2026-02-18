#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

try:
    from common import get_logger
    from download import download_source
    from patch import apply_patches
    from build import build_chromium
    from run import run_chromium
    from check import check_environment
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

    # Build
    parser_build = subparsers.add_parser('build', help='Build Chromium', parents=[parent_parser])
    parser_build.add_argument('--target', default='chrome', help='Build target')

    # Run
    parser_run = subparsers.add_parser('run', help='Run Chromium with extension loaded', parents=[parent_parser])
    parser_run.add_argument('args', nargs=argparse.REMAINDER, help='Arguments to pass to Chromium')

    args = parser.parse_args()
    logger = get_logger()

    if args.command == 'download':
        download_source(args)
    elif args.command == 'check':
        check_environment(args)
    elif args.command == 'patch':
        apply_patches(args)
    elif args.command == 'build':
        build_chromium(args)
    elif args.command == 'run':
        run_chromium(args)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
