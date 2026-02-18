import os
import shutil
import subprocess
import sys
from pathlib import Path
from common import get_logger

def resize_and_copy_icon(src_path, dest_path, target_size):
    """
    Resize image from src_path and save to dest_path with target_size (width=height).
    Uses sips (macOS) or direct copy as fallback.
    """
    logger = get_logger()
    
    # Fallback to sips on macOS
    if sys.platform.startswith('darwin'):
        try:
            cmd = ["sips", "-z", str(target_size), str(target_size), str(src_path), "--out", str(dest_path)]
            subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except:
            pass
    
    # Fallback to direct copy
    shutil.copy2(src_path, dest_path)

def install_icons(icons_src, icons_dest):
    """
    Copy icons from icons_src to icons_dest (and subdirectories).
    Adapted from browser/v145/dev.py
    """
    logger = get_logger()
    
    icons_src = Path(icons_src)
    icons_dest = Path(icons_dest)

    if not icons_src.exists() or not icons_dest.exists():
        logger.warning(f"Icons source or destination not found.")
        if not icons_src.exists():
            logger.warning(f"   Missing source: {icons_src}")
        if not icons_dest.exists():
             logger.warning(f"   Missing dest: {icons_dest}")
        return

    logger.info(f"Copying icons from {icons_src} to {icons_dest}...")
    
    try:
        # 1. Copy PNGs to root of theme/chromium (for general use)
        for icon_file in icons_src.glob("*.png"):
            shutil.copy2(icon_file, icons_dest)
        
        # 1.1 Copy SVG if exists
        svg_source = icons_src / "product_logo.svg"
        if not svg_source.exists():
            svg_source = icons_src / "product_logo_1024.svg"
        
        if svg_source.exists():
             shutil.copy2(svg_source, icons_dest / "product_logo.svg")
             logger.info(f"   Copied product_logo.svg")
        
        # 2. Copy PNGs to linux subdirectory
        linux_dest_dir = icons_dest / "linux"
        if linux_dest_dir.exists():
            for icon_file in icons_src.glob("*.png"):
                shutil.copy2(icon_file, linux_dest_dir)
            logger.info("   Copied PNGs to linux/")

        # 3. Copy/Generate ICNS to mac subdirectory
        local_icns = icons_src / "mac" / "app.icns"
        if not local_icns.exists():
            local_icns = icons_src / "app.icns"
            
        if local_icns.exists():
            mac_dest_dir = icons_dest / "mac"
            if mac_dest_dir.exists():
                # Ensure parent dir exists
                if not (mac_dest_dir / "app.icns").parent.exists():
                    (mac_dest_dir / "app.icns").parent.mkdir(parents=True, exist_ok=True)
                    
                shutil.copy2(local_icns, mac_dest_dir / "app.icns")
                logger.info("   Copied app.icns to mac/")
                
                # Also update Assets.xcassets and Icon.iconset
                # Map of target filenames to source PNGs (approximate sizes)
                mac_assets_map = {
                    "Assets.xcassets/AppIcon.appiconset/appicon_16.png": 16,
                    "Assets.xcassets/AppIcon.appiconset/appicon_32.png": 32,
                    "Assets.xcassets/AppIcon.appiconset/appicon_64.png": 64,
                    "Assets.xcassets/AppIcon.appiconset/appicon_128.png": 128,
                    "Assets.xcassets/AppIcon.appiconset/appicon_256.png": 256,
                    "Assets.xcassets/AppIcon.appiconset/appicon_512.png": 512,
                    "Assets.xcassets/AppIcon.appiconset/appicon_1024.png": 1024,
                    
                    "Assets.xcassets/Icon.iconset/icon_256x256.png": 256,
                    "Assets.xcassets/Icon.iconset/icon_256x256@2x.png": 512, 
                }
                
                # Source mapping from size to filename in icons_src
                size_to_src = {
                    16: 'product_logo_16.png',
                    32: 'product_logo_32.png',
                    64: 'product_logo_64.png',
                    128: 'product_logo_128.png',
                    256: 'product_logo_256.png',
                    512: 'product_logo_512.png',
                    1024: 'product_logo_1024.png',
                }
                
                # Find best fallback if exact size missing
                available_sizes = sorted([s for s in size_to_src.keys() if (icons_src / size_to_src[s]).exists()], reverse=True)
                
                if available_sizes:
                    for rel_path, size in mac_assets_map.items():
                        dest_file = mac_dest_dir / rel_path
                        # Ensure dir exists
                        if dest_file.parent.exists():
                             # Find source
                            src_file = None
                            if size in available_sizes:
                                src_file = icons_src / size_to_src[size]
                            else:
                                # Use largest available
                                src_file = icons_src / size_to_src[available_sizes[0]]
                            
                            if src_file and src_file.exists():
                                resize_and_copy_icon(src_file, dest_file, size)
                    
                    logger.info("   Updated macOS Assets.xcassets and Icon.iconset")
                
                # Compile Assets.car if possible
                assets_xcassets = mac_dest_dir / "Assets.xcassets"
                
                if assets_xcassets.exists() and sys.platform.startswith('darwin'):
                    logger.info(f"   Compiling Assets.car from {assets_xcassets}...")
                    try:
                        cmd = [
                            "/usr/bin/actool",
                            "--output-format", "human-readable-text",
                            "--notices", "--warnings",
                            "--platform", "macosx",
                            "--minimum-deployment-target", "10.13",
                            "--target-device", "mac",
                            "--compress-pngs",
                            "--compile", str(mac_dest_dir),
                            str(assets_xcassets)
                        ]
                        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        logger.info("   Successfully recompiled Assets.car")
                    except Exception as e:
                        logger.warning(f"   Failed to recompile Assets.car: {e}")

        # 4. Copy ICO to win subdirectory
        local_ico = icons_src / "win" / "chromium.ico"
        if not local_ico.exists():
            local_ico = icons_src / "chromium.ico"
            
        if local_ico.exists():
            win_dest_dir = icons_dest / "win"
            if win_dest_dir.exists():
                # Overwrite main icon
                shutil.copy2(local_ico, win_dest_dir / "chromium.ico")
                
                # Overwrite other ICOs with the same main icon
                other_icos = ["app_list.ico", "chromium_doc.ico", "chromium_pdf.ico", "incognito.ico"]
                for ico_name in other_icos:
                    dest_ico = win_dest_dir / ico_name
                    if dest_ico.exists():
                        shutil.copy2(local_ico, dest_ico)
                
                logger.info("   Updated Windows .ico files")
                
                # Update tiles
                tiles_dir = win_dest_dir / "tiles"
                if tiles_dir.exists():
                    logo_src = icons_src / "product_logo_256.png"
                    if not logo_src.exists():
                        logo_src = icons_src / "product_logo_128.png"
                    
                    if logo_src.exists():
                         shutil.copy2(logo_src, tiles_dir / "Logo.png")

                    small_logo_src = icons_src / "product_logo_64.png"
                    if not small_logo_src.exists():
                        small_logo_src = icons_src / "product_logo_128.png"
                        
                    if small_logo_src.exists():
                        shutil.copy2(small_logo_src, tiles_dir / "SmallLogo.png")
                        
                    logger.info("   Updated Windows tiles")

        logger.info("   Icons updated.")
        
    except Exception as e:
        logger.error(f"Error copying icons: {e}")
