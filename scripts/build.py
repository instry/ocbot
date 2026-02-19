import subprocess
import os
from pathlib import Path
from common import get_logger, get_source_dir

def build_chromium(args):
    logger = get_logger()
    
    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()
    
    if not src_dir.exists():
        logger.error("Source directory not found.")
        return
        
    # Check if we are in the root of a depot_tools checkout (contains .gclient or src/)
    if (src_dir / 'src').exists() and (src_dir / 'src').is_dir():
        logger.info(f"Found 'src' subdirectory. Using {src_dir}/src as build root.")
        src_dir = src_dir / 'src'

    logger.info("Starting build process...")
    logger.info("NOTE: This requires 'gn' and 'ninja' to be in PATH and depot_tools configured.")
    
    out_dir = src_dir / 'out' / 'Default'
    
    # Always ensure gn is available and args.gn is correct
    if subprocess.call(['which', 'gn'], stdout=subprocess.DEVNULL) != 0:
            logger.error("'gn' command not found. Please install depot_tools and add to PATH.")
            return

    # Basic flags for ungoogled-chromium
    flags = [
        'is_debug=false',
        'symbol_level=0',
        'use_service_discovery=false',
        'use_siso=true',
    ]
    
    # Check if args.gn exists and if use_siso needs to be added
    args_gn_path = out_dir / 'args.gn'
    needs_gen = False
    needs_clean = False
    
    if args_gn_path.exists():
        with open(args_gn_path, 'r') as f:
            content = f.read()
        if 'use_siso=true' not in content:
            logger.info("Enabling siso in existing args.gn...")
            with open(args_gn_path, 'a') as f:
                f.write('\nuse_siso=true\n')
            needs_clean = True
            needs_gen = True
    else:
        logger.info("Generating build files with gn...")
        # Write args.gn
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(args_gn_path, 'w') as f:
            f.write('\n'.join(flags))
        needs_gen = True
    
    if needs_clean:
            logger.info("Cleaning output directory for siso migration...")
            subprocess.run(['gn', 'clean', str(out_dir)], cwd=src_dir, check=True)

    if needs_gen:
        subprocess.run(['gn', 'gen', str(out_dir)], cwd=src_dir, check=True)
    
    logger.info(f"Building {args.target}...")
    subprocess.run(['autoninja', '-C', str(out_dir), args.target], cwd=src_dir)
