import subprocess
import os
from common import get_logger, get_source_dir

def build_chromium(args):
    logger = get_logger()
    src_dir = get_source_dir()
    
    if not src_dir.exists():
        logger.error("Source directory not found.")
        return
        
    logger.info("Starting build process...")
    logger.info("NOTE: This requires 'gn' and 'ninja' to be in PATH and depot_tools configured.")
    
    out_dir = src_dir / 'out' / 'Default'
    
    if not out_dir.exists():
        logger.info("Generating build files with gn...")
        # Check if gn is available
        if subprocess.call(['which', 'gn'], stdout=subprocess.DEVNULL) != 0:
             logger.error("'gn' command not found. Please install depot_tools and add to PATH.")
             return

        # Basic flags for ungoogled-chromium
        flags = [
            'is_debug=false',
            'symbol_level=0',
            'enable_nacl=false',
            'use_service_discovery=false',
        ]
        
        # Write args.gn
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(out_dir / 'args.gn', 'w') as f:
            f.write('\n'.join(flags))
            
        subprocess.run(['gn', 'gen', str(out_dir)], cwd=src_dir, check=True)
    
    logger.info(f"Building {args.target}...")
    subprocess.run(['autoninja', '-C', str(out_dir), args.target], cwd=src_dir)
