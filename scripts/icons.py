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

    if sys.platform.startswith('darwin'):
        try:
            cmd = ["sips", "-z", str(target_size), str(target_size),
                   str(src_path), "--out", str(dest_path)]
            subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except Exception:
            pass

    # Fallback to direct copy
    shutil.copy2(src_path, dest_path)


def _find_best_source(icons_src, target_size, size_to_src, available_sizes):
    """Find the best source PNG for a target size."""
    if target_size in available_sizes:
        return icons_src / size_to_src[target_size]
    # Use the closest larger size, or the largest available
    for s in sorted(available_sizes):
        if s >= target_size:
            return icons_src / size_to_src[s]
    return icons_src / size_to_src[available_sizes[-1]] if available_sizes else None


def _compile_assets_car(assets_xcassets, output_dir, logger):
    """
    Compile Assets.xcassets into Assets.car using actool.
    This is CRITICAL on macOS -- the .app bundle uses Assets.car for the Dock icon.
    """
    if not sys.platform.startswith('darwin'):
        logger.warning("   Cannot compile Assets.car on non-macOS platform")
        return False

    if not assets_xcassets.exists():
        logger.warning(f"   Assets.xcassets not found: {assets_xcassets}")
        return False

    logger.info(f"   Compiling Assets.car from {assets_xcassets}...")
    try:
        cmd = [
            "xcrun", "actool",
            "--output-format", "human-readable-text",
            "--notices", "--warnings",
            "--platform", "macosx",
            "--minimum-deployment-target", "10.15",
            "--target-device", "mac",
            "--compress-pngs",
            "--app-icon", "AppIcon",
            "--output-partial-info-plist", "/dev/null",
            "--compile", str(output_dir),
            str(assets_xcassets)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            logger.info("   Successfully compiled Assets.car")
            return True
        else:
            logger.warning(f"   actool returned {result.returncode}: {result.stderr}")
    except FileNotFoundError:
        logger.warning("   xcrun/actool not found. Is Xcode installed?")
    except Exception as e:
        logger.warning(f"   Failed to compile Assets.car: {e}")

    return False


def install_icons(icons_src, icons_dest):
    """
    Copy ocbot icons from icons_src to icons_dest, replacing all default branding.

    icons_src: ocbot/resources/patches/chrome/app/theme/chromium/
    icons_dest: chromium-src/chrome/app/theme/chromium/

    On macOS, this replaces:
    - app.icns (legacy icon)
    - Assets.car (compiled asset catalog -- the ACTUAL Dock icon on macOS 11+)
    - Assets.xcassets/**/*.png (source PNGs for asset catalog)
    - product_logo_*.png (unscaled resources for dialogs/notifications)
    - default_100_percent/chromium/*.png (1x scaled resources for about page, tab icon)
    - default_200_percent/chromium/*.png (2x scaled resources)
    - components/resources/default_*_percent/chromium/*.png (chrome://version)
    """
    logger = get_logger()

    icons_src = Path(icons_src)
    icons_dest = Path(icons_dest)

    if not icons_src.exists():
        logger.warning(f"Icons source not found: {icons_src}")
        return

    if not icons_dest.exists():
        logger.warning(f"Icons destination not found: {icons_dest}")
        return

    logger.info(f"Installing ocbot icons...")
    logger.info(f"   Source: {icons_src}")
    logger.info(f"   Dest:   {icons_dest}")

    # Size-to-filename mapping for source PNGs in icons_src root
    size_to_src = {
        16: 'product_logo_16.png',
        22: 'product_logo_22_mono.png',
        24: 'product_logo_24.png',
        48: 'product_logo_48.png',
        64: 'product_logo_64.png',
        128: 'product_logo_128.png',
        256: 'product_logo_256.png',
        512: 'product_logo_512.png',
        1024: 'product_logo_1024.png',
    }
    available_sizes = sorted([s for s in size_to_src if (icons_src / size_to_src[s]).exists()])

    if not available_sizes:
        logger.error("   No source PNG icons found!")
        return

    logger.info(f"   Available source sizes: {available_sizes}")

    try:
        # ====================================================================
        # 1. Unscaled PNGs in chrome/app/theme/chromium/
        # ====================================================================
        count = 0
        for icon_file in icons_src.glob("*.png"):
            dest = icons_dest / icon_file.name
            shutil.copy2(icon_file, dest)
            count += 1
        logger.info(f"   [1/7] Copied {count} PNGs to theme/chromium/")

        # Copy toolbar icon (mono version used for IDR_OCBOT_TOOLBAR_ICON resource)
        toolbar_icon_src = icons_src / "product_logo_22_mono.png"
        if toolbar_icon_src.exists():
            shutil.copy2(toolbar_icon_src, icons_dest / "ocbot_toolbar_icon.png")
            logger.info("   [1/7] Copied ocbot_toolbar_icon.png (toolbar mono icon)")

        # Copy SVG if exists
        for svg_name in ["product_logo.svg", "product_logo_animation.svg"]:
            svg_src = icons_src / svg_name
            if svg_src.exists():
                shutil.copy2(svg_src, icons_dest / svg_name)
                logger.info(f"   [1/7] Copied {svg_name}")

        # ====================================================================
        # 2. macOS: app.icns + Assets.xcassets + Assets.car
        # ====================================================================
        mac_dest_dir = icons_dest / "mac"
        if mac_dest_dir.exists():
            # 2a. app.icns
            local_icns = icons_src / "mac" / "app.icns"
            if not local_icns.exists():
                local_icns = icons_src / "app.icns"
            if local_icns.exists():
                shutil.copy2(local_icns, mac_dest_dir / "app.icns")
                logger.info("   [2/7] Copied app.icns")
            else:
                logger.warning("   [2/7] No app.icns found in source!")

            # 2b. Assets.xcassets PNGs
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

            assets_count = 0
            for rel_path, size in mac_assets_map.items():
                dest_file = mac_dest_dir / rel_path
                if dest_file.parent.exists():
                    src_file = _find_best_source(icons_src, size, size_to_src, available_sizes)
                    if src_file and src_file.exists():
                        resize_and_copy_icon(src_file, dest_file, size)
                        assets_count += 1
            logger.info(f"   [2/7] Updated {assets_count} macOS Assets.xcassets PNGs")

            # 2c. Compile Assets.car (CRITICAL for macOS Dock icon!)
            assets_xcassets = mac_dest_dir / "Assets.xcassets"
            if _compile_assets_car(assets_xcassets, mac_dest_dir, logger):
                logger.info("   [2/7] Assets.car compiled successfully (Dock icon WILL update)")
            else:
                logger.warning("   [2/7] Assets.car NOT recompiled!")
                logger.warning("         The Dock icon will still show the old logo.")
                logger.warning("         Fix: Install Xcode command line tools, or manually replace Assets.car")
        else:
            logger.info("   [2/7] Skipped macOS icons (no mac/ directory)")

        # ====================================================================
        # 3. Scaled resources: default_100_percent/chromium/
        # ====================================================================
        # These control: about:chrome page logo, tab favicon, auth dialogs
        theme_base = icons_dest.parent  # chrome/app/theme/
        scaled_1x_dir = theme_base / "default_100_percent" / "chromium"
        if scaled_1x_dir.exists():
            scaled_1x_map = {
                "product_logo_16.png": 16,
                "product_logo_32.png": 32,
                "product_logo_name_22.png": 22,
                "product_logo_name_22_white.png": 22,
            }
            s_count = 0
            for fname, size in scaled_1x_map.items():
                dest_file = scaled_1x_dir / fname
                if dest_file.exists():
                    src_file = _find_best_source(icons_src, size, size_to_src, available_sizes)
                    if src_file and src_file.exists():
                        resize_and_copy_icon(src_file, dest_file, size)
                        s_count += 1

            # Linux subdir
            linux_1x = scaled_1x_dir / "linux"
            if linux_1x.exists():
                for fname, size in [("product_logo_16.png", 16), ("product_logo_32.png", 32)]:
                    dest_file = linux_1x / fname
                    if dest_file.exists():
                        src_file = _find_best_source(icons_src, size, size_to_src, available_sizes)
                        if src_file and src_file.exists():
                            resize_and_copy_icon(src_file, dest_file, size)

            logger.info(f"   [3/7] Updated {s_count} scaled @1x resources")
        else:
            logger.info("   [3/7] Skipped @1x (directory not found)")

        # ====================================================================
        # 4. Scaled resources: default_200_percent/chromium/
        # ====================================================================
        scaled_2x_dir = theme_base / "default_200_percent" / "chromium"
        if scaled_2x_dir.exists():
            scaled_2x_map = {
                "product_logo_16.png": 32,   # 16px @2x = 32px actual
                "product_logo_32.png": 64,   # 32px @2x = 64px actual
                "product_logo_name_22.png": 44,  # 22px @2x = 44px actual
                "product_logo_name_22_white.png": 44,
            }
            s_count = 0
            for fname, actual_size in scaled_2x_map.items():
                dest_file = scaled_2x_dir / fname
                if dest_file.exists():
                    src_file = _find_best_source(icons_src, actual_size, size_to_src, available_sizes)
                    if src_file and src_file.exists():
                        resize_and_copy_icon(src_file, dest_file, actual_size)
                        s_count += 1
            logger.info(f"   [4/7] Updated {s_count} scaled @2x resources")
        else:
            logger.info("   [4/7] Skipped @2x (directory not found)")

        # ====================================================================
        # 5. Components resources (chrome://version page logo)
        # ====================================================================
        # Path: chromium-src/components/resources/default_{100,200}_percent/chromium/
        src_root = icons_dest.parent.parent.parent.parent  # go up to src/
        comp_base = src_root / "components" / "resources"

        comp_1x = comp_base / "default_100_percent" / "chromium"
        comp_2x = comp_base / "default_200_percent" / "chromium"

        c_count = 0
        for comp_dir, scale in [(comp_1x, 1), (comp_2x, 2)]:
            if not comp_dir.exists():
                continue
            # product_logo.png ~= 64px@1x, 128px@2x
            size = 64 * scale
            for fname in ["product_logo.png", "product_logo_white.png", "favicon_product.png"]:
                dest_file = comp_dir / fname
                if dest_file.exists():
                    src_file = _find_best_source(icons_src, size, size_to_src, available_sizes)
                    if src_file and src_file.exists():
                        resize_and_copy_icon(src_file, dest_file, size)
                        c_count += 1
        logger.info(f"   [5/7] Updated {c_count} components resources")

        # ====================================================================
        # 6. Linux icons
        # ====================================================================
        linux_dest_dir = icons_dest / "linux"
        if linux_dest_dir.exists():
            l_count = 0
            for icon_file in icons_src.glob("*.png"):
                shutil.copy2(icon_file, linux_dest_dir)
                l_count += 1
            logger.info(f"   [6/7] Copied {l_count} PNGs to linux/")
        else:
            logger.info("   [6/7] Skipped linux (no linux/ directory)")

        # ====================================================================
        # 7. Windows ICO
        # ====================================================================
        local_ico = icons_src / "win" / "chromium.ico"
        if not local_ico.exists():
            local_ico = icons_src / "chromium.ico"

        if local_ico.exists():
            win_dest_dir = icons_dest / "win"
            if win_dest_dir.exists():
                shutil.copy2(local_ico, win_dest_dir / "chromium.ico")

                for ico_name in ["app_list.ico", "chromium_doc.ico",
                                 "chromium_pdf.ico", "incognito.ico"]:
                    dest_ico = win_dest_dir / ico_name
                    if dest_ico.exists():
                        shutil.copy2(local_ico, dest_ico)

                # Tiles
                tiles_dir = win_dest_dir / "tiles"
                if tiles_dir.exists():
                    for fname, size in [("Logo.png", 256), ("SmallLogo.png", 64)]:
                        src_file = _find_best_source(icons_src, size, size_to_src, available_sizes)
                        if src_file and src_file.exists():
                            shutil.copy2(src_file, tiles_dir / fname)

                logger.info("   [7/7] Updated Windows ICO and tiles")
            else:
                logger.info("   [7/7] Skipped Windows (no win/ directory)")
        else:
            logger.info("   [7/7] Skipped Windows (no .ico source)")

        logger.info("   Icon installation complete!")

    except Exception as e:
        logger.error(f"Error installing icons: {e}")
        import traceback
        traceback.print_exc()
