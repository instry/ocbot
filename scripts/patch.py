import subprocess
import shutil
from pathlib import Path
from common import get_logger, get_source_dir, get_project_root

def _get_src_dir(args):
    logger = get_logger()
    if args.src_dir:
        src_dir = Path(args.src_dir).resolve()
    else:
        src_dir = get_source_dir()
        
    if not src_dir.exists():
        logger.error("Source directory not found. Run download first.")
        return None

    # Check if we are in the root of a depot_tools checkout (contains .gclient or src/)
    if (src_dir / 'src').exists() and (src_dir / 'src').is_dir():
        logger.info(f"Found 'src' subdirectory. Using {src_dir}/src as patch root.")
        src_dir = src_dir / 'src'
    return src_dir

def _get_patches_list(logger):
    patches_dir = get_project_root() / 'resources' / 'patches'
    series_path = patches_dir / 'series'
    
    if not series_path.exists():
        logger.error(f"Series file not found at {series_path}")
        return [], patches_dir

    # Read series
    patches = []
    with open(series_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            patches.append(line)
    return patches, patches_dir

def apply_patches(args):
    logger = get_logger()
    src_dir = _get_src_dir(args)
    if not src_dir:
        return

    logger.info("Applying patches...")
    
    patches, patches_dir = _get_patches_list(logger)
    if not patches:
        return

    logger.info(f"Found {len(patches)} patches to apply.")
    
    # Check if git command exists
    if not shutil.which('git'):
        logger.error("Command 'git' not found.")
        return

    for i, patch_name in enumerate(patches):
        patch_file = patches_dir / patch_name
        if not patch_file.exists():
            logger.warning(f"Patch file {patch_name} not found. Skipping.")
            continue
        
        # Check if it's a patch/diff file or a source file to copy
        is_patch = patch_name.endswith('.patch') or patch_name.endswith('.diff')
        
        if not is_patch:
            # It's a source file, copy it to the destination
            dest_path = src_dir / patch_name
            
            try:
                # Ensure parent directory exists
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                
                # Copy file
                shutil.copy2(patch_file, dest_path)
                logger.debug(f"[{i+1}/{len(patches)}] Copied {patch_name} to {dest_path}")
            except Exception as e:
                logger.error(f"Failed to copy {patch_name}: {e}")
                return
            continue

        # Use git apply
        cmd = ['git', 'apply', '--ignore-whitespace', '-p1', str(patch_file)]
        
        result = subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True)
        
        if result.returncode != 0:
            # Check if it's already applied
            # git apply --check --reverse returns 0 if the patch can be reversed (meaning it's applied)
            cmd_check = ['git', 'apply', '--check', '--reverse', '--ignore-whitespace', '-p1', str(patch_file)]
            result_check = subprocess.run(cmd_check, cwd=src_dir, capture_output=True, text=True)
            
            if result_check.returncode == 0:
                 logger.debug(f"[{i+1}/{len(patches)}] {patch_name} (already applied)")
            else:
                logger.error(f"Failed to apply patch {patch_name}:")
                logger.error(result.stderr or result.stdout)
                return
        else:
             logger.debug(f"[{i+1}/{len(patches)}] {patch_name} (applied)")
            
    logger.info("All patches applied successfully.")

def reset_source(args):
    logger = get_logger()
    src_dir = _get_src_dir(args)
    if not src_dir:
        return

    logger.info("Resetting source directory...")

    # Check if .git exists
    if (src_dir / '.git').exists():
        logger.info("Git repository detected. Using git to reset...")
        try:
            # git clean -fd
            logger.info("Cleaning untracked files (git clean -fd)...")
            subprocess.run(['git', 'clean', '-fd'], cwd=src_dir, check=True)
            
            # git checkout .
            logger.info("Discarding changes (git checkout .)...")
            subprocess.run(['git', 'checkout', '.'], cwd=src_dir, check=True)
            
            logger.info("Source reset complete.")
        except subprocess.CalledProcessError as e:
            logger.error(f"Git reset failed: {e}")
    else:
        logger.error("No .git directory found. Cannot reset source using git.")
