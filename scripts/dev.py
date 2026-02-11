#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

try:
    from common import get_logger
    from download import download_source
    from patch import apply_patches
    from build import build_chromium
except ImportError as e:
    print(f"Error importing scripts: {e}")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='ocbot development utility')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Download
    parser_download = subparsers.add_parser('download', help='Download Chromium source')
    parser_download.add_argument('--version', help='Chromium version to download')

    # Patch
    parser_patch = subparsers.add_parser('patch', help='Apply patches')

    # Build
    parser_build = subparsers.add_parser('build', help='Build Chromium')
    parser_build.add_argument('--target', default='chrome', help='Build target')

    args = parser.parse_args()
    logger = get_logger()

    if args.command == 'download':
        download_source(args)
    elif args.command == 'patch':
        apply_patches(args)
    elif args.command == 'build':
        build_chromium(args)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
