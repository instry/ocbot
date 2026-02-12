#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

try:
    from common import get_logger
    from download import download_source
    from patch import apply_patches
    from build import build_chromium
    from check import check_environment
except ImportError as e:
    print(f"Error importing scripts: {e}")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='ocbot development utility')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Check
    parser_check = subparsers.add_parser('check', help='Check environment and recommend download method')

    # Download
    parser_download = subparsers.add_parser('download', help='Download Chromium source')
    parser_download.add_argument('--version', help='Chromium version to download (tarball method only)')
    parser_download.add_argument('--method', choices=['tarball', 'depot', 'sync'], 
                                default='tarball',
                                help='Download method: tarball (quick) or depot (full dev) or sync (re-run gclient sync)')
    parser_download.add_argument('--no-history', action='store_true',
                                help='Fetch without git history (depot method only, reduces size)')
    parser_download.add_argument('--without-android', action='store_true',
                                help='Skip Android dependencies (depot method only)')

    # Patch
    parser_patch = subparsers.add_parser('patch', help='Apply patches')

    # Build
    parser_build = subparsers.add_parser('build', help='Build Chromium')
    parser_build.add_argument('--target', default='chrome', help='Build target')

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
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
