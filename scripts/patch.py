import subprocess
import shutil
import sys
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

def _normalize_crlf(patch_file, src_dir):
    """On Windows, convert CRLF→LF in files targeted by a patch so context lines match."""
    if sys.platform != 'win32':
        return
    try:
        content = patch_file.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return
    for line in content.splitlines():
        # Parse "--- a/path" or "+++ b/path" to find target files
        if line.startswith('--- a/') or line.startswith('+++ b/'):
            rel = line[6:]
            if rel == '/dev/null':
                continue
            target = src_dir / rel
            if target.is_file():
                try:
                    raw = target.read_bytes()
                    if b'\r\n' in raw:
                        target.write_bytes(raw.replace(b'\r\n', b'\n'))
                except Exception:
                    pass


def _find_modified_subrepos(src_dir, base_ref):
    """Find sub-repo paths that have Subproject commit changes."""
    cmd = ['git', 'diff', '--name-status', '--no-renames', base_ref]
    result = subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True)
    subrepos = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split('\t')
        file_path = parts[-1]
        full_path = src_dir / file_path
        if full_path.is_dir() and (full_path / '.git').exists():
            subrepos.append(file_path)
    return subrepos


def _get_subrepo_base_commit(src_dir, base_ref, subrepo_path):
    """Get the commit hash a sub-repo was pinned to at base_ref."""
    cmd = ['git', 'ls-tree', base_ref, '--', subrepo_path]
    result = subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True)
    # Output: "160000 commit <hash>\t<path>"
    if result.returncode == 0 and result.stdout.strip():
        parts = result.stdout.strip().split()
        return parts[2]  # the commit hash
    return None


def _find_subrepo_dirs(src_dir):
    """Find all sub-repo directories (dirs with their own .git) under src_dir.
    Only checks known locations rather than scanning everything."""
    subrepo_dirs = []
    # Check third_party and v8 for sub-repos
    for candidate_parent in ['third_party', 'v8']:
        parent = src_dir / candidate_parent
        if not parent.is_dir():
            continue
        for child in parent.iterdir():
            if child.is_dir() and (child / '.git').exists():
                subrepo_dirs.append(child)
    return subrepo_dirs


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

        # Determine apply directory: sub-repo patches use a different cwd
        subrepo_prefix = '.subrepos' + os.sep
        if patch_name.startswith(subrepo_prefix) or patch_name.startswith('.subrepos/'):
            # Extract sub-repo path and relative file path
            # Format: .subrepos/<subrepo_path>/<file_path>[.patch]
            after_prefix = patch_name.split('.subrepos/', 1)[1] if '.subrepos/' in patch_name else patch_name.split(subrepo_prefix, 1)[1]
            # We need to find which part is the subrepo path vs the file path
            # The subrepo path is a directory with .git inside src_dir
            parts = Path(after_prefix).parts
            subrepo_path = None
            for j in range(1, len(parts)):
                candidate = str(Path(*parts[:j]))
                if (src_dir / candidate / '.git').exists():
                    subrepo_path = candidate
                    break
            if subrepo_path:
                apply_dir = src_dir / subrepo_path
                rel_in_subrepo = str(Path(*parts[len(Path(subrepo_path).parts):]))
            else:
                logger.warning(f"Could not find sub-repo for {patch_name}. Applying to main repo.")
                apply_dir = src_dir
                rel_in_subrepo = after_prefix
        else:
            apply_dir = src_dir
            rel_in_subrepo = patch_name

        # Check if it's a patch/diff file or a source file to copy
        is_patch = patch_name.endswith('.patch') or patch_name.endswith('.diff')

        if not is_patch:
            # It's a source file, copy it to the destination
            dest_path = apply_dir / rel_in_subrepo

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
        # On Windows, normalize target files from CRLF to LF so patch context matches
        _normalize_crlf(patch_file, apply_dir)
        cmd = ['git', 'apply', '--ignore-whitespace', '-p1', str(patch_file)]

        result = subprocess.run(cmd, cwd=apply_dir, capture_output=True, text=True)

        if result.returncode != 0:
            # Check if it's already applied
            cmd_check = ['git', 'apply', '--check', '--reverse', '--ignore-whitespace', '-p1', str(patch_file)]
            result_check = subprocess.run(cmd_check, cwd=apply_dir, capture_output=True, text=True)

            if result_check.returncode == 0:
                 logger.debug(f"[{i+1}/{len(patches)}] {patch_name} (already applied)")
            else:
                cmd_check_3way = ['git', 'apply', '--check', '--3way', '--ignore-whitespace', '-p1', str(patch_file)]
                result_check_3way = subprocess.run(cmd_check_3way, cwd=apply_dir, capture_output=True, text=True)
                if result_check_3way.returncode == 0:
                    cmd_3way = ['git', 'apply', '--3way', '--ignore-whitespace', '-p1', str(patch_file)]
                    result_3way = subprocess.run(cmd_3way, cwd=apply_dir, capture_output=True, text=True)
                    if result_3way.returncode == 0:
                        logger.debug(f"[{i+1}/{len(patches)}] {patch_name} (applied with 3way)")
                        continue

                logger.error(f"Failed to apply patch {patch_name}:")
                logger.error(result.stderr or result.stdout)
                if result_check_3way.returncode != 0:
                    logger.error(result_check_3way.stderr or result_check_3way.stdout)
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
            # Determine the base ref (tag) to reset to
            base_ref = getattr(args, 'base', None)
            if not base_ref:
                from common import get_chromium_version
                version = get_chromium_version()
                if version:
                    # Try to resolve version tag
                    for tag in [version, f"refs/tags/{version}", f"v{version}"]:
                        result = subprocess.run(
                            ['git', 'rev-parse', '--verify', tag],
                            cwd=src_dir, capture_output=True, text=True)
                        if result.returncode == 0:
                            base_ref = tag
                            break

            if base_ref:
                logger.info(f"Resetting to base tag: {base_ref}")
                subprocess.run(['git', 'reset', '--hard', base_ref], cwd=src_dir, check=True)
            else:
                logger.info("No base tag found. Resetting to HEAD...")
                subprocess.run(['git', 'reset', '--hard'], cwd=src_dir, check=True)

            # git clean -fd (exclude ignored files like out/)
            logger.info("Cleaning untracked files (git clean -fd)...")
            subprocess.run(['git', 'clean', '-fd'], cwd=src_dir, check=True)

            # Also reset sub-repos (third_party deps with their own .git)
            subrepo_dirs = _find_subrepo_dirs(src_dir)
            for subrepo in subrepo_dirs:
                rel = subrepo.relative_to(src_dir)
                logger.info(f"Resetting sub-repo: {rel}")
                subprocess.run(['git', 'clean', '-fd'], cwd=subrepo, check=True)
                subprocess.run(['git', 'reset', '--hard'], cwd=subrepo, check=True)

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
        # Try to auto-detect base tag from version
        from common import get_chromium_version
        version = get_chromium_version()
        if version:
             # Try to resolve tag
             potential_tags = [version, f"refs/tags/{version}", f"v{version}"]
             for tag in potential_tags:
                 try:
                     subprocess.run(['git', 'rev-parse', tag], cwd=src_dir, check=True, capture_output=True)
                     base_ref = tag
                     logger.info(f"Auto-detected base tag: {tag}")
                     break
                 except subprocess.CalledProcessError:
                     pass

    if not base_ref:
        # Try 'main' branch as base (upstream Chromium code before our modifications)
        try:
            subprocess.run(['git', 'rev-parse', '--verify', 'main'], cwd=src_dir, check=True, capture_output=True)
            base_ref = 'main'
            logger.info("Auto-detected base branch: main")
        except subprocess.CalledProcessError:
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

    # Check for sub-repos with changes (even if main repo has none)
    subrepos = _find_modified_subrepos(src_dir, base_ref)

    if not modified_files and not subrepos:
        logger.info("No modified files found. Nothing to update.")
        return

    logger.info(f"Found {len(modified_files)} modified files in main repo, {len(subrepos)} modified sub-repos.")

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
             # Filter out header lines (diff --git, index, ---, +++, @@, new/deleted file mode)
             content_lines = [l for l in lines if not (
                 l.startswith('diff --git') or l.startswith('index ') or
                 l.startswith('--- ') or l.startswith('+++ ') or
                 l.startswith('@@ ') or l.startswith('new file mode') or
                 l.startswith('deleted file mode')
             )]

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

    logger.info(f"Generated {generated_count} patches/files from main repo.")

    # 4. Process sub-repos (third_party deps with their own .git)
    subrepo_count = 0

    for subrepo_path in subrepos:
        subrepo_base = _get_subrepo_base_commit(src_dir, base_ref, subrepo_path)
        if not subrepo_base:
            logger.warning(f"Could not determine base commit for sub-repo {subrepo_path}. Skipping.")
            continue

        subrepo_dir = src_dir / subrepo_path
        logger.info(f"Scanning sub-repo: {subrepo_path} (base: {subrepo_base[:12]})")

        # Get modified files in sub-repo
        cmd_sr = ['git', 'diff', '--name-status', '--no-renames', subrepo_base]
        result_sr = subprocess.run(cmd_sr, cwd=subrepo_dir, capture_output=True, text=True)
        if result_sr.returncode != 0:
            logger.error(f"Failed to diff sub-repo {subrepo_path}: {result_sr.stderr}")
            continue

        sr_modified = []
        sr_seen = set()

        for line in result_sr.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split('\t')
            status = parts[0][0]
            file_path = parts[-1]
            if file_path in sr_seen:
                continue
            sr_seen.add(file_path)
            is_binary = file_path.lower().endswith(binary_extensions)
            sr_modified.append({'path': file_path, 'status': status, 'is_binary': is_binary})

        # Also check for untracked files in sub-repo
        cmd_sr_status = ['git', 'status', '--porcelain']
        result_sr_status = subprocess.run(cmd_sr_status, cwd=subrepo_dir, capture_output=True, text=True)
        for line in result_sr_status.stdout.splitlines():
            if not line.strip():
                continue
            status_code = line[:2]
            file_path = line[3:].strip()
            if ' -> ' in file_path:
                file_path = file_path.split(' -> ')[1]
            if file_path in sr_seen:
                continue
            if '??' in status_code:
                full_path = subrepo_dir / file_path
                if full_path.is_dir():
                    for p in full_path.rglob('*'):
                        if p.is_file():
                            rel_path = str(p.relative_to(subrepo_dir))
                            if rel_path in sr_seen:
                                continue
                            sr_seen.add(rel_path)
                            is_binary = rel_path.lower().endswith(binary_extensions)
                            sr_modified.append({'path': rel_path, 'status': '??', 'is_binary': is_binary})
                else:
                    sr_seen.add(file_path)
                    is_binary = file_path.lower().endswith(binary_extensions)
                    sr_modified.append({'path': file_path, 'status': '??', 'is_binary': is_binary})

        if not sr_modified:
            logger.info(f"No modified files in sub-repo {subrepo_path}.")
            continue

        logger.info(f"Found {len(sr_modified)} modified files in sub-repo {subrepo_path}.")

        # Add untracked files to index in sub-repo
        sr_untracked = [f['path'] for f in sr_modified if f['status'] == '??']
        if sr_untracked:
            try:
                subprocess.run(['git', 'add', '-N'] + sr_untracked, cwd=subrepo_dir, check=True)
            except subprocess.CalledProcessError:
                pass

        # Generate patches for sub-repo files
        subrepo_patches_dir = patches_dir / '.subrepos' / subrepo_path

        for item in sr_modified:
            file_path = item['path']
            status = item['status']
            is_binary = item['is_binary']

            if is_binary and status != 'D':
                dest_path = subrepo_patches_dir / file_path
                src_file = subrepo_dir / file_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                try:
                    if src_file.exists():
                        shutil.copy2(src_file, dest_path)
                        logger.info(f"Copied binary file (sub-repo): {subrepo_path}/{file_path}")
                        subrepo_count += 1
                    else:
                        logger.warning(f"Binary file {subrepo_path}/{file_path} seems deleted or missing.")
                except Exception as e:
                    logger.error(f"Failed to copy binary file {subrepo_path}/{file_path}: {e}")
                continue

            patch_rel_path = f"{file_path}.patch"
            patch_file = subrepo_patches_dir / patch_rel_path
            patch_file.parent.mkdir(parents=True, exist_ok=True)

            cmd_diff = ['git', 'diff', '--binary', '--full-index', subrepo_base, '--', file_path]
            diff_result = subprocess.run(cmd_diff, cwd=subrepo_dir, capture_output=True, text=True)

            if diff_result.returncode != 0:
                logger.error(f"Failed to generate diff for {subrepo_path}/{file_path}: {diff_result.stderr}")
                continue

            if not diff_result.stdout.strip():
                logger.warning(f"No diff generated for {subrepo_path}/{file_path}. Skipping.")
                continue

            with open(patch_file, 'w') as f:
                f.write(diff_result.stdout)

            subrepo_count += 1
            logger.info(f"Generated patch: .subrepos/{subrepo_path}/{patch_rel_path}")

    total = generated_count + subrepo_count
    logger.info(f"Successfully updated {total} patches/files ({generated_count} main, {subrepo_count} sub-repo).")
