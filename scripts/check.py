import shutil
import subprocess
import requests
import os
from pathlib import Path
from common import get_logger

def check_disk_space(path="."):
    """Check available disk space in GB"""
    total, used, free = shutil.disk_usage(path)
    return free // (2**30)

def check_network():
    """Check connectivity to Chromium servers"""
    try:
        requests.get("https://chromium.googlesource.com", timeout=5)
        return True
    except:
        return False

def check_depot_tools():
    """Check if depot_tools is installed"""
    return shutil.which('fetch') is not None and shutil.which('gclient') is not None

def check_environment(args):
    """Check environment and recommend download method"""
    print("==========================================")
    print("  ocbot Chromium Source Download Selection")
    print("=========================================="
          )
    print("")

    # 1. Check disk space
    print("1. Checking disk space...")
    
    check_path = "."
    if args.src_dir:
        # Check the parent directory of src_dir (where download happens)
        check_path = str(Path(args.src_dir).resolve().parent)
        if not os.path.exists(check_path):
            try:
                Path(check_path).mkdir(parents=True, exist_ok=True)
            except Exception as e:
                print(f"   Warning: Could not create directory {check_path}: {e}")
                print(f"   Checking current directory instead.")
                check_path = "."

    free_gb = check_disk_space(check_path)
    print(f"   Checking path: {os.path.abspath(check_path)}")
    print(f"   Available space: {free_gb}GB")
    print("")

    # 2. Check network
    print("2. Checking network connection...")
    network_ok = check_network()
    if network_ok:
        print("   Can access Chromium servers ✓")
    else:
        print("   Cannot directly access Chromium servers (proxy may be needed) ⚠")
    print("")

    # 3. Check depot_tools
    print("3. Checking depot_tools...")
    depot_available = check_depot_tools()
    if depot_available:
        print("   depot_tools installed ✓")
    else:
        print("   depot_tools not installed ⚠")
        print("   Install command: git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git")
    print("")

    print("==========================================")
    print("  Recommendation")
    print("=========================================="
          )
    print("")

    if depot_available and free_gb > 100:
        print("🎯 Recommendation: Depot Tools (Full Development)")
        print("")
        print("Reason:")
        print("  ✓ depot_tools installed")
        print(f"  ✓ Sufficient disk space ({free_gb}GB > 100GB)")
        print("")
        print("Run command:")
        print("  ./scripts/dev.py download --method depot --no-history")
        print("")
        print("Or if you have proxy:")
        print("  ./scripts/dev.py download --method depot")

    elif free_gb > 60:
        print("🎯 Recommendation: Tarball (Quick Start)")
        print("")
        print("Reason:")
        print(f"  ✓ Sufficient disk space ({free_gb}GB > 60GB)")
        if not depot_available:
            print("  ⚠ depot_tools not installed")
        if not network_ok:
            print("  ⚠ Network might be restricted")
        print("")
        print("Run command:")
        print("  ./scripts/dev.py download --method tarball")
        print("")
        print("Note: Tarball method lacks some third-party dependencies, suitable for quick experience.")
        print("      If you need full development environment, please install depot_tools first and use depot method.")

    else:
        print("⚠️ Disk space might be insufficient")
        print("")
        print(f"Current available: {free_gb}GB")
        print("Suggested at least: 60GB (tarball) or 100GB (depot)")
        print("")
        print("Please clean up disk and try again, or use --no-history to reduce download size:")
        print("  ./scripts/dev.py download --method depot --no-history")

    print("")
    print("==========================================")
    print("  Other Options")
    print("=========================================="
          )
    print("")
    print("View detailed comparison:")
    print("  cat docs/download_methods.md")
    print("")
    print("Get help:")
    print("  ./scripts/dev.py download --help")
    print("")
