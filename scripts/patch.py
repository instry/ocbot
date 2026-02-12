import subprocess
import shutil
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root

def apply_patches(args):
    logger = get_logger()
    
    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()
        
    if not src_dir.exists():
        logger.error("Source directory not found. Run download first.")
        return

    logger.info("Applying patches...")
    
    patches_dir = get_project_root() / 'resources' / 'patches'
    series_path = patches_dir / 'series'
    
    if not series_path.exists():
        logger.error(f"Series file not found at {series_path}")
        return

    # Read series
    patches = []
    with open(series_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            patches.append(line)

    logger.info(f"Found {len(patches)} patches to apply.")
    
    # Check if patch command exists
    if not shutil.which('patch'):
        logger.error("Command 'patch' not found.")
        return

    for i, patch_name in enumerate(patches):
        patch_file = patches_dir / patch_name
        if not patch_file.exists():
            logger.warning(f"Patch file {patch_name} not found. Skipping.")
            continue
        
        # logger.info(f"[{i+1}/{len(patches)}] Applying {patch_name}...")
        
        cmd = ['patch', '-p1', '--forward', '--reject-file=-', '--no-backup-if-mismatch', '-i', str(patch_file), '-d', str(src_dir)]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            # Check if it's already applied
            if "previously applied" in result.stdout or "previously applied" in result.stderr:
                 logger.info(f"[{i+1}/{len(patches)}] {patch_name} (already applied)")
            else:
                logger.error(f"Failed to apply patch {patch_name}:")
                logger.error(result.stderr or result.stdout)
                return
        else:
             logger.info(f"[{i+1}/{len(patches)}] {patch_name} (applied)")
            
    logger.info("All patches applied successfully.")
