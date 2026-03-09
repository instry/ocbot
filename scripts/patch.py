import subprocess
import shutil
import os
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
    from common import get_patches_dir
    patches_dir = get_patches_dir()
    
    if not patches_dir or not patches_dir.exists():
        logger.warning(f"Patches directory not found (expected at {patches_dir})")
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

        # Use git apply (--ignore-cr-at-eol handles Windows CRLF line endings)
        cmd = ['git', 'apply', '--ignore-whitespace', '--ignore-cr-at-eol', '-p1', str(patch_file)]

        result = subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True)

        if result.returncode != 0:
            # Check if it's already applied
            # git apply --check --reverse returns 0 if the patch can be reversed (meaning it's applied)
            cmd_check = ['git', 'apply', '--check', '--reverse', '--ignore-whitespace', '--ignore-cr-at-eol', '-p1', str(patch_file)]
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
    Supports both uncommitted changes and committed changes relative to a base.
    """
    logger = get_logger()
    src_dir = _get_src_dir(args)
    if not src_dir:
        return

    from common import get_patches_dir
    patches_dir = get_patches_dir()
    if not patches_dir.exists():
        logger.info(f"Creating patches directory: {patches_dir}")
        patches_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine Base Commit
    base_ref = getattr(args, 'base', None)
    
    if not base_ref:
        logger.info("No base commit specified. Defaulting to HEAD (uncommitted changes only).")
        logger.info("To compare against a specific commit (e.g. for committed changes), use --base <commit-ish>")
        base_ref = 'HEAD'
    else:
        logger.info(f"Comparing against base: {base_ref}")

    logger.info("Scanning for modified files...")
    
    modified_files = []
    
    # Define binary extensions
    binary_extensions = (
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns', '.svg', '.car', 
        '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.gz', '.tar', 
        '.xz', '.bz2', '.7z', '.jar', '.so', '.dll', '.exe', '.dylib', 
        '.node', '.bin', '.dat', '.db', '.sqlite', '.pak', '.crx', '.rdb'
    )

    # 1. Get changed files relative to base
    # We use git diff --name-status base_ref
    # This covers both committed and uncommitted changes if base_ref != HEAD
    # If base_ref == HEAD, it only covers nothing? No.
    # If base_ref is a commit, `git diff base_ref` shows difference between Working Tree and base_ref.
    
    cmd = ['git', 'diff', '--name-status', '--no-renames', base_ref]
    result = subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True)
    
    if result.returncode != 0:
        logger.error(f"Failed to run git diff: {result.stderr}")
        return

    # Also check untracked files with git status
    cmd_status = ['git', 'status', '--porcelain']
    result_status = subprocess.run(cmd_status, cwd=src_dir, capture_output=True, text=True)
    
    seen_paths = set()

    # Process diff output
    for line in result.stdout.splitlines():
        if not line.strip(): continue
        parts = line.split('\t')
        status = parts[0][0] # M, A, D, etc.
        file_path = parts[-1]
        
        if file_path in seen_paths: continue
        seen_paths.add(file_path)
        
        is_binary = file_path.lower().endswith(binary_extensions)
        modified_files.append({'path': file_path, 'status': status, 'is_binary': is_binary})

    # Process status output (mainly for untracked files ??)
    # Actually `git diff commit` includes untracked files ONLY if we intent-to-add them.
    # So we still need git status for purely untracked files.
    for line in result_status.stdout.splitlines():
        if not line.strip(): continue
        status_code = line[:2]
        file_path = line[3:].strip()
        if ' -> ' in file_path:
            file_path = file_path.split(' -> ')[1]
            
        if file_path in seen_paths: continue
        
        # Only care about untracked here
        if '??' in status_code:
            full_path = src_dir / file_path
            if full_path.is_dir():
                 for p in full_path.rglob('*'):
                    if p.is_file():
                        rel_path = str(p.relative_to(src_dir))
                        if rel_path in seen_paths: continue
                        seen_paths.add(rel_path)
                        is_binary = rel_path.lower().endswith(binary_extensions)
                        modified_files.append({'path': rel_path, 'status': '??', 'is_binary': is_binary})
            else:
                seen_paths.add(file_path)
                is_binary = file_path.lower().endswith(binary_extensions)
                modified_files.append({'path': file_path, 'status': '??', 'is_binary': is_binary})

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
    
    # Add untracked files to index (intent-to-add) so git diff can see them if needed
    untracked = [f['path'] for f in modified_files if f['status'] == '??']
    if untracked:
         try:
            subprocess.run(['git', 'add', '-N'] + untracked, cwd=src_dir, check=True)
         except subprocess.CalledProcessError:
             pass

    for item in modified_files:
        file_path = item['path']
        status = item['status']
        is_binary = item['is_binary']
        
        if status == 'D':
            # Deleted file. 
            # If we want to reflect deletion in patch, we can generate a patch that deletes it.
            # But currently ocbot structure maps file->patch. If file is gone, maybe we just don't generate patch?
            # Or we generate a patch file that says "deleted file mode..."
            # Let's try to generate patch for deletion too.
            pass

        # Determine patch path
        if is_binary and status != 'D':
            dest_path = patches_dir / file_path
            src_file = src_dir / file_path
            
            # Create parent directory
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            try:
                if src_file.exists():
                    shutil.copy2(src_file, dest_path)
                    logger.info(f"Copied binary file: {file_path}")
                    generated_count += 1
                else:
                    logger.warning(f"Binary file {file_path} seems deleted or missing.")
            except Exception as e:
                logger.error(f"Failed to copy binary file {file_path}: {e}")
            continue

        # Text file -> Generate patch
        # We want the patch to reflect change from Base -> Working Tree
        
        patch_rel_path = f"{file_path}.patch"
        patch_file = patches_dir / patch_rel_path
        
        # Create parent directory
        patch_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Generate diff against BASE
        cmd_diff = ['git', 'diff', '--binary', '--full-index', base_ref, '--', file_path]
        
        diff_result = subprocess.run(cmd_diff, cwd=src_dir, capture_output=True, text=True)
        
        if diff_result.returncode != 0:
            logger.error(f"Failed to generate diff for {file_path}: {diff_result.stderr}")
            continue
            
        if not diff_result.stdout.strip():
            logger.warning(f"No diff generated for {file_path}. Skipping.")
            continue
            
        # Check if it's just a subproject commit change (gitlink)
        # Typically looks like:
        # -Subproject commit <old>
        # +Subproject commit <new>
        # And we want to ignore it if it's in third_party
        if 'third_party/' in file_path or 'v8/' in file_path:
             lines = diff_result.stdout.strip().splitlines()
             # Filter out header lines (diff --git, index, ---, +++)
             content_lines = [l for l in lines if not (l.startswith('diff --git') or l.startswith('index ') or l.startswith('--- ') or l.startswith('+++ '))]
             
             # Check if all remaining lines are subproject commit lines
             is_only_subproject = True
             for l in content_lines:
                 if not (l.startswith('-Subproject commit') or l.startswith('+Subproject commit')):
                     is_only_subproject = False
                     break
            
             if is_only_subproject and content_lines:
                 logger.info(f"Skipping submodule version change for {file_path}")
                 continue

        with open(patch_file, 'w') as f:
            f.write(diff_result.stdout)
            
        generated_count += 1
        logger.info(f"Generated patch: {patch_rel_path}")

    logger.info(f"Successfully updated {generated_count} patches/files.")
