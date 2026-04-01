const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const { getDesktopVersion, projectRoot } = require("./common.cjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} exited with code ${result.status ?? 1}`,
    );
}

async function packageMacApp(options) {
  const {
    appPath,
    sign,
    appleId,
    teamId,
    password,
    passwordFile,
    notarize,
    official,
  } = options;

  if (!appPath || !fs.existsSync(appPath)) {
    throw new Error(`App bundle not found: ${appPath}`);
  }

  const appName = path.basename(appPath, ".app");
  const productVersion = getDesktopVersion();
  console.log(
    `[package-mac-app] Packaging ${appName} (${productVersion}) from ${appPath}`,
  );

  const distDir = path.join(projectRoot, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Find architecture from app
  const isArm64 = appPath.includes("arm64") || appPath.includes("aarch64");
  const arch = isArm64 ? "arm64" : "x64";
  const finalDmgName = `${appName}-${productVersion}-${arch}.dmg`;
  const finalDmg = path.join(distDir, finalDmgName);
  const volName = `${appName} ${productVersion}`;
  const iconFile = path.join(projectRoot, "resources", "icons", "icon.icns");

  let signIdentity = sign || process.env.CODESIGN_IDENTITY;
  if (signIdentity === true) signIdentity = undefined; // If just --sign flag was passed without value

  let notaryPassword = password || process.env.NOTARY_PASSWORD;
  let finalAppleId = appleId || process.env.APPLE_ID;
  let finalTeamId = teamId || process.env.TEAM_ID;
  let notaryProfile = notarize || process.env.NOTARY_PROFILE;

  // Read password file if needed
  if (!notaryPassword && !notaryProfile && (passwordFile || official)) {
    const pwFile = path.resolve(projectRoot, passwordFile || ".apple.json");
    if (fs.existsSync(pwFile)) {
      try {
        const content = fs.readFileSync(pwFile, "utf8").trim();
        try {
          const data = JSON.parse(content);
          if (data.password) notaryPassword = data.password;
          if (data["apple-id"] && !finalAppleId)
            finalAppleId = data["apple-id"];
          if (data["team-id"] && !finalTeamId) finalTeamId = data["team-id"];
          if (data.sign && !signIdentity) signIdentity = data.sign;
        } catch {
          notaryPassword = content;
        }
      } catch (e) {
        console.error(`[package-mac-app] Error reading password file: ${e}`);
      }
    }
  }

  if (
    (notaryProfile || (finalAppleId && finalTeamId && notaryPassword)) &&
    !signIdentity
  ) {
    throw new Error(
      "Code signing identity (--sign) is required for notarization.",
    );
  }

  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "ocbot-pkg-"));
  try {
    const staging = path.join(tmpdir, "staging");
    fs.mkdirSync(staging);

    const destApp = path.join(staging, `${appName}.app`);
    console.log("[package-mac-app] Copying app bundle to staging area...");
    run("cp", ["-R", appPath, destApp]);

    if (signIdentity) {
      console.log(
        `[package-mac-app] Signing app with identity: ${signIdentity}`,
      );
      const { signAsync } = require("@electron/osx-sign");
      const entitlementsFile = path.join(
        projectRoot,
        "resources",
        "entitlements.mac.plist",
      );

      const signOpts = {
        app: destApp,
        identity: signIdentity,
        hardenedRuntime: true,
      };
      if (fs.existsSync(entitlementsFile)) {
        signOpts.entitlements = entitlementsFile;
        signOpts.optionsForFile = (filePath) => {
          return {
            entitlements: entitlementsFile,
          };
        };
      } else {
        console.warn(
          `[package-mac-app] Entitlements file not found: ${entitlementsFile}`,
        );
      }
      await signAsync(signOpts);
      console.log("[package-mac-app] Signing completed.");
    }

    fs.symlinkSync("/Applications", path.join(staging, "Applications"));

    const rwDmg = path.join(tmpdir, "rw.dmg");
    console.log("[package-mac-app] Creating writable DMG...");
    run("hdiutil", [
      "create",
      "-srcfolder",
      staging,
      "-volname",
      volName,
      "-format",
      "UDRW",
      "-fs",
      "HFS+",
      rwDmg,
    ]);

    if (fs.existsSync(iconFile)) {
      const mountPoint = path.join(tmpdir, "mount");
      fs.mkdirSync(mountPoint);
      console.log("[package-mac-app] Setting volume icon...");
      run("hdiutil", [
        "attach",
        rwDmg,
        "-mountpoint",
        mountPoint,
        "-nobrowse",
        "-quiet",
      ]);
      try {
        fs.copyFileSync(iconFile, path.join(mountPoint, ".VolumeIcon.icns"));
        spawnSync("SetFile", [
          "-c",
          "icnC",
          path.join(mountPoint, ".VolumeIcon.icns"),
        ]);
        spawnSync("SetFile", [
          "-a",
          "V",
          path.join(mountPoint, ".VolumeIcon.icns"),
        ]);
        spawnSync("SetFile", ["-a", "C", mountPoint]);
      } finally {
        run("hdiutil", ["detach", mountPoint, "-quiet"]);
      }
    }

    console.log("[package-mac-app] Compressing DMG (ULMO)...");
    if (fs.existsSync(finalDmg)) {
      fs.unlinkSync(finalDmg);
    }
    run("hdiutil", ["convert", rwDmg, "-format", "ULMO", "-o", finalDmg]);

    if (notaryProfile || (finalAppleId && finalTeamId && notaryPassword)) {
      console.log(`[package-mac-app] Notarizing ${finalDmg}...`);
      const cmd = ["xcrun", "notarytool", "submit", finalDmg, "--wait"];
      if (notaryProfile) {
        cmd.push("--keychain-profile", notaryProfile);
      } else {
        cmd.push(
          "--apple-id",
          finalAppleId,
          "--team-id",
          finalTeamId,
          "--password",
          notaryPassword,
        );
      }
      console.log(`[package-mac-app] Running: ${cmd.join(" ")}`);
      const notaryRes = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit" });
      if (notaryRes.status !== 0) {
        throw new Error("Notarization failed.");
      }

      console.log("[package-mac-app] Stapling ticket to DMG...");
      run("xcrun", ["stapler", "staple", finalDmg]);
    }

    console.log("[package-mac-app] Verifying DMG...");
    run("hdiutil", ["verify", finalDmg]);

    const stat = fs.statSync(finalDmg);
    const sizeMb = stat.size / (1024 * 1024);
    console.log(
      `[package-mac-app] Done: ${finalDmg} (${sizeMb.toFixed(1)} MB)`,
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
}

module.exports = { packageMacApp };
