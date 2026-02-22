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
    
    if not patches_dir.exists():
        logger.error(f"Patches directory not found at {patches_dir}")
        return [], patches_dir

    # Find all files in patches_dir recursively
    patches = []
    for path in patches_dir.rglob('*'):
        if path.is_file() and not path.name.startswith('.'):
            # Calculate relative path from patches_dir
            rel_path = path.relative_to(patches_dir)
            patches.append(str(rel_path))
            
    # Sort alphabetically to ensure deterministic order
    patches.sort()
            
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
            # git clean -fd (exclude ignored files like out/)
            logger.info("Cleaning untracked files (git clean -fd)...")
            subprocess.run(['git', 'clean', '-fd'], cwd=src_dir, check=True)
            
            # git reset --hard
            logger.info("Discarding changes (git reset --hard)...")
            subprocess.run(['git', 'reset', '--hard'], cwd=src_dir, check=True)
            
            logger.info("Source reset complete.")
        except subprocess.CalledProcessError as e:
            logger.error(f"Git reset failed: {e}")
    else:
        logger.error("No .git directory found. Cannot reset source using git.")


def update_patches(args):
    """
    Generate patches from modified files in src directory.
    1. Identify modified/new files using git status.
    2. Clear existing patches in resources/patches (excluding series file).
    3. Generate new patches using git diff.
    """
    logger = get_logger()
    src_dir = _get_src_dir(args)
    if not src_dir:
        return

    patches_dir = get_project_root() / 'resources' / 'patches'
    
    logger.info("Scanning for modified files in source...")
    
    # 1. Identify modified files
    # git status --porcelain to get machine-readable output
    cmd = ['git', 'status', '--porcelain']
    result = subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True)
    
    if result.returncode != 0:
        logger.error(f"Failed to run git status: {result.stderr}")
        return

    modified_files = []
    
    # Define binary extensions
    binary_extensions = (
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns', '.svg', '.car', 
        '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.gz', '.tar', 
        '.xz', '.bz2', '.7z', '.jar', '.so', '.dll', '.exe', '.dylib', 
        '.node', '.bin', '.dat', '.db', '.sqlite', '.pak', '.crx', '.rdb'
    )

    # Lines look like " M chrome/browser/ui/browser.cc" or "?? new_file.cc"
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        
        # Status code is first 2 chars
        status_code = line[:2]
        file_path_raw = line[3:].strip()
        
        # Handle renames if any (format: R  old -> new) - git status --porcelain v1
        if ' -> ' in file_path_raw:
            file_path_raw = file_path_raw.split(' -> ')[1]
            
        # Check if it's a directory (untracked dir)
        full_path = src_dir / file_path_raw
        
        if full_path.is_dir():
            # If it's a directory, walk it and add all files inside
            for p in full_path.rglob('*'):
                if p.is_file():
                    rel_path = str(p.relative_to(src_dir))
                    is_binary = rel_path.lower().endswith(binary_extensions)
                    # Treat files inside untracked dir as untracked
                    modified_files.append({'path': rel_path, 'status': '??', 'is_binary': is_binary})
        else:
            is_binary = file_path_raw.lower().endswith(binary_extensions)
            modified_files.append({'path': file_path_raw, 'status': status_code, 'is_binary': is_binary})

    if not modified_files:
        logger.info("No modified files found. Nothing to update.")
        return

    logger.info(f"Found {len(modified_files)} modified files.")
    
    # 2. Clear existing patches
    logger.info(f"Clearing patches directory: {patches_dir}")
    if patches_dir.exists():
        for item in patches_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    else:
        patches_dir.mkdir(parents=True, exist_ok=True)

    # 3. Generate patches or copy files
    generated_count = 0
    
    # Identify untracked files
    untracked_files = [f['path'] for f in modified_files if '??' in f['status']]
    
    if untracked_files:
        logger.info(f"Adding {len(untracked_files)} untracked files to git index (intent-to-add)...")
        try:
            subprocess.run(['git', 'add', '-N'] + untracked_files, cwd=src_dir, check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to add files to git index: {e}")
            return

    for item in modified_files:
        file_path = item['path']
        is_binary = item['is_binary']

        # Determine patch path
        if is_binary:
            dest_path = patches_dir / file_path
            src_file = src_dir / file_path
            
            # Create parent directory
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            try:
                shutil.copy2(src_file, dest_path)
                logger.info(f"Copied binary file: {file_path}")
                generated_count += 1
            except Exception as e:
                logger.error(f"Failed to copy binary file {file_path}: {e}")
            continue

        # Text file -> Generate patch
        patch_rel_path = f"{file_path}.patch"
        patch_file = patches_dir / patch_rel_path
        
        # Create parent directory
        patch_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Generate diff against HEAD
        # Use --binary just in case text files have binary data
        # Use --full-index
        cmd_diff = ['git', 'diff', '--binary', '--full-index', 'HEAD', '--', file_path]
        
        diff_result = subprocess.run(cmd_diff, cwd=src_dir, capture_output=True, text=True)
        
        if diff_result.returncode != 0:
            logger.error(f"Failed to generate diff for {file_path}: {diff_result.stderr}")
            continue
            
        if not diff_result.stdout.strip():
            logger.warning(f"No diff generated for {file_path}. Skipping.")
            continue
            
        with open(patch_file, 'w') as f:
            f.write(diff_result.stdout)
            
        generated_count += 1
        logger.info(f"Generated patch: {patch_rel_path}")

    logger.info(f"Successfully updated {generated_count} patches/files.")

