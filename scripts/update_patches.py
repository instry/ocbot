import os
import subprocess
import shutil
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
# Expecting to run from ocbot/ocbot/scripts/, so PROJECT_ROOT is ocbot/ocbot
# And chromium source is at ../../chromium/<version>/src relative to script
# Or ../chromium/<version>/src relative to git repo root (if git repo is inside root folder)

VERSION_FILE = PROJECT_ROOT / 'resources' / 'chromium_version.txt'

try:
    CHROMIUM_VERSION = VERSION_FILE.read_text().strip()
except Exception as e:
    print(f"Error reading version file {VERSION_FILE}: {e}")
    exit(1)

# Assuming standard layout:
# root/
#   chromium/
#   ocbot/ (git repo)
#     scripts/
SRC_DIR = PROJECT_ROOT.parent / 'chromium' / CHROMIUM_VERSION / 'src'
PATCH_ROOT = PROJECT_ROOT / 'resources' / 'patches'

def get_existing_patches():
    # Map src_path (string) -> patch_path (Path)
    # We will store multiple keys for the same patch to handle variations
    patch_map = {} 
    
    for root, dirs, files in os.walk(PATCH_ROOT):
        for file in files:
            if file == 'series' or file.startswith('.'):
                continue
                
            patch_path = Path(root) / file
            rel_path = patch_path.relative_to(PATCH_ROOT)
            
            if file.endswith('.patch'):
                # Key 1: Exact match minus .patch (e.g. file.cc.patch -> file.cc)
                src_rel_1 = str(rel_path)[:-6]
                patch_map[src_rel_1] = patch_path
                
                # Key 2: Match without extension (e.g. file.patch -> file)
                # This handles cases where file.patch maps to file.cc
                src_rel_2 = os.path.splitext(src_rel_1)[0]
                patch_map[src_rel_2] = patch_path
            else:
                # Direct file
                patch_map[str(rel_path)] = patch_path
                
    return patch_map

def main():
    print(f"Scanning {SRC_DIR}...")
    
    result = subprocess.run(['git', 'status', '--porcelain'], cwd=SRC_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print("Error running git status")
        return

    patch_map = get_existing_patches()
    
    lines = result.stdout.splitlines()
    for line in lines:
        status = line[:2]
        file_path = line[3:]
        
        # Filter static/binary files
        if file_path.endswith(('.png', '.ico', '.icns', '.jpg', '.car')):
            print(f"Skipping binary/static file: {file_path}")
            continue
            
        src_file = SRC_DIR / file_path
        
        if not src_file.exists():
            print(f"Skipping deleted file: {file_path}")
            continue

        print(f"Processing {status} {file_path}")
        
        # Try to find existing patch
        dest_patch = patch_map.get(file_path)
        
        # Fallback: try looking up without extension
        if not dest_patch:
            file_path_no_ext = os.path.splitext(file_path)[0]
            dest_patch = patch_map.get(file_path_no_ext)

        if dest_patch:
            # Existing patch/file
            if dest_patch.name.endswith('.patch'):
                print(f"  Updating patch: {dest_patch}")
                with open(dest_patch, 'w') as f:
                    subprocess.run(['git', 'diff', file_path], cwd=SRC_DIR, stdout=f)
            else:
                print(f"  Updating file: {dest_patch}")
                shutil.copy2(src_file, dest_patch)
        else:
            # New file?
            if 'ocbot/' in file_path or file_path.endswith('.icon'):
                dest_path = PATCH_ROOT / file_path
                print(f"  Creating new file copy: {dest_path}")
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_file, dest_path)
            else:
                # Create new patch with .patch extension appended to FULL filename
                # e.g. file.cc -> file.cc.patch
                dest_path = PATCH_ROOT / (file_path + ".patch")
                print(f"  Creating new patch: {dest_path}")
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                with open(dest_path, 'w') as f:
                    subprocess.run(['git', 'diff', file_path], cwd=SRC_DIR, stdout=f)

    print("Done.")

if __name__ == '__main__':
    main()
