const fs = require("node:fs");
const path = require("node:path");

const {
  getConfiguredOpenClawCommit,
  getConfiguredOpenClawVersion,
  getDesktopVersion,
  hasCliFlag,
  macArchitectures,
  normalizeArchName,
  normalizePlatformName,
  projectRoot,
  readCliOption,
  resolveCommand,
  run,
  syncPackageVersionFiles,
  toElectronBuilderPlatformFlag,
  windowsArchitectures,
} = require("./common.cjs");

const argv = process.argv.slice(2);

function printHelp() {
  console.log(`Usage:
  node scripts/package.cjs [options]

Options:
  --platform <mac|win|all>
  --arch <x64|arm64|ia32|all>
  --target <app|dmg|exe|all>
  --publish <never|always>
  --sign [identity]
  --app-path <path>
  --apple-id <id>
  --team-id <id>
  --password <password>
  --password-file <file>
  --notarize <profile>
  --official
  --skip-build
  --skip-openclaw
  --dry-run
  --help
`);
}

function unique(values) {
  return [...new Set(values)];
}

function expandPlatforms(value) {
  if (!value || value === "all") {
    return ["darwin", "win32"];
  }

  return value
    .split(",")
    .map((entry) => normalizePlatformName(entry))
    .filter(Boolean);
}

function expandArchitectures(platform, value) {
  const allowedArchitectures =
    platform === "darwin"
      ? new Set(macArchitectures)
      : new Set(windowsArchitectures);
  if (!value || value === "all") {
    return [...allowedArchitectures];
  }

  const architectures = value
    .split(",")
    .map((entry) => normalizeArchName(entry))
    .filter((entry) => Boolean(entry) && allowedArchitectures.has(entry));

  return unique(architectures);
}

function expandTargets(platform, value) {
  const defaultTargets = platform === "darwin" ? ["app", "dmg"] : ["exe"];
  if (!value || value === "all") {
    return defaultTargets;
  }

  const rawTargets = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const allowedTargets =
    platform === "darwin" ? new Set(["app", "dmg"]) : new Set(["exe"]);

  const targets = rawTargets.filter((entry) => allowedTargets.has(entry));
  return unique(targets);
}

function getTaskLabel(task) {
  const platformLabel = task.platform === "darwin" ? "mac" : "win";
  return `${platformLabel}/${task.arch}/${task.target}`;
}

function resolveTasks(options) {
  const platforms = expandPlatforms(options.platform);
  if (platforms.length === 0) {
    throw new Error(`Unsupported platform: ${options.platform ?? "unknown"}`);
  }

  const tasks = [];
  for (const platform of platforms) {
    const architectures = expandArchitectures(platform, options.arch);
    if (architectures.length === 0) {
      throw new Error(
        `Unsupported arch for ${platform}: ${options.arch ?? "unknown"}`,
      );
    }

    const targets = expandTargets(platform, options.target);
    if (targets.length === 0) {
      throw new Error(
        `Unsupported target for ${platform}: ${options.target ?? "unknown"}`,
      );
    }

    for (const arch of architectures) {
      for (const target of targets) {
        tasks.push({ platform, arch, target });
      }
    }
  }

  return tasks;
}

function buildElectronBuilderArgs(task, publish) {
  const args = [
    "exec",
    "electron-builder",
    "--",
    "--config",
    "electron-builder.yml",
    "--publish",
    publish,
  ];
  if (task.target === "app") {
    args.push("--dir");
  }

  args.push(toElectronBuilderPlatformFlag(task.platform));

  if (task.target === "dmg") {
    args.push("dmg");
  }

  if (task.target === "exe") {
    args.push("nsis");
  }

  args.push(`--${task.arch}`);
  return args;
}

function runDesktopBuild() {
  console.log("[package] Building desktop application");
  run(resolveCommand("npm"), ["run", "build"], { cwd: projectRoot });
}

function getMacAppOutputDir(arch) {
  return path.join(projectRoot, "out", `mac-${arch}`);
}

function getVersionedAppName(version, arch) {
  return `Ocbot-${version}-${arch}.app`;
}

function renameMacAppBundle(task) {
  if (task.platform !== "darwin" || task.target !== "app") {
    return;
  }

  const version = getDesktopVersion();
  const outputDir = getMacAppOutputDir(task.arch);
  const sourcePath = path.join(outputDir, "Ocbot.app");
  const targetPath = path.join(
    outputDir,
    getVersionedAppName(version, task.arch),
  );

  if (!fs.existsSync(sourcePath)) {
    return;
  }

  if (sourcePath === targetPath) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.renameSync(sourcePath, targetPath);
  console.log(
    `[package] Renamed mac app bundle to ${path.basename(targetPath)}`,
  );
}

function runElectronBuilder(task, options) {
  const args = buildElectronBuilderArgs(task, options.publish);
  const env = {
    ...process.env,
  };

  if (!options.sign) {
    env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  } else if (typeof options.sign === "string") {
    env.CSC_NAME = options.sign;
  }

  if (options.appleId) env.APPLE_ID = options.appleId;
  if (options.teamId) env.APPLE_TEAM_ID = options.teamId;
  if (options.password) env.APPLE_APP_SPECIFIC_PASSWORD = options.password;

  if (options.official || options.passwordFile) {
    const pwFile = path.resolve(
      projectRoot,
      options.passwordFile || ".apple.json",
    );
    if (fs.existsSync(pwFile)) {
      try {
        const content = fs.readFileSync(pwFile, "utf8").trim();
        try {
          const data = JSON.parse(content);
          if (data.password && !env.APPLE_APP_SPECIFIC_PASSWORD)
            env.APPLE_APP_SPECIFIC_PASSWORD = data.password;
          if (data["apple-id"] && !env.APPLE_ID)
            env.APPLE_ID = data["apple-id"];
          if (data["team-id"] && !env.APPLE_TEAM_ID)
            env.APPLE_TEAM_ID = data["team-id"];
          if (data.sign && !env.CSC_NAME && options.sign)
            env.CSC_NAME = data.sign;
        } catch {
          if (!env.APPLE_APP_SPECIFIC_PASSWORD)
            env.APPLE_APP_SPECIFIC_PASSWORD = content;
        }
      } catch (e) {
        console.error(`[package] Error reading password file: ${e}`);
      }
    }
  }

  if (options.skipOpenClaw) {
    env.OCBOT_SKIP_OPENCLAW_PREP = "1";
  }

  console.log(`[package] Packaging ${getTaskLabel(task)}`);
  console.log(`[package] npm ${args.join(" ")}`);
  console.log(`[package] Signing ${options.sign ? "enabled" : "disabled"}`);

  if (options.dryRun) {
    return;
  }

  run(resolveCommand("npm"), args, {
    cwd: projectRoot,
    env,
  });

  renameMacAppBundle(task);
}

function generateUpdateManifest(options) {
  if (options.dryRun) {
    return;
  }

  console.log("[package] Generating update manifest");
  run(resolveCommand("node"), ["scripts/generate-update-manifest.cjs"], {
    cwd: projectRoot,
    env: process.env,
  });
}

function main() {
  if (hasCliFlag(argv, "--help")) {
    printHelp();
    return;
  }

  const options = {
    arch: readCliOption(argv, "--arch"),
    dryRun: hasCliFlag(argv, "--dry-run"),
    platform: readCliOption(argv, "--platform"),
    publish: readCliOption(argv, "--publish") || "never",
    sign: readCliOption(argv, "--sign") || hasCliFlag(argv, "--sign"),
    skipBuild: hasCliFlag(argv, "--skip-build"),
    skipOpenClaw: hasCliFlag(argv, "--skip-openclaw"),
    target: readCliOption(argv, "--target"),
    appPath: readCliOption(argv, "--app-path"),
    appleId: readCliOption(argv, "--apple-id"),
    teamId: readCliOption(argv, "--team-id"),
    password: readCliOption(argv, "--password"),
    passwordFile: readCliOption(argv, "--password-file"),
    notarize: readCliOption(argv, "--notarize"),
    official: hasCliFlag(argv, "--official"),
  };

  if (options.appPath) {
    if (options.dryRun) {
      console.log(`[package] Dry run for packaging ${options.appPath}`);
      return;
    }
    const { packageMacApp } = require("./package-mac-app.cjs");
    packageMacApp(options).catch((err) => {
      console.error(`[package] Failed to package mac app: ${err}`);
      process.exit(1);
    });
    return;
  }

  const tasks = resolveTasks(options);
  syncPackageVersionFiles();
  console.log(`[package] Desktop version ${getDesktopVersion()}`);
  console.log(`[package] OpenClaw version ${getConfiguredOpenClawVersion()}`);
  console.log(`[package] OpenClaw commit ${getConfiguredOpenClawCommit()}`);
  console.log(
    `[package] Planned tasks: ${tasks.map((task) => getTaskLabel(task)).join(", ")}`,
  );

  if (!options.skipBuild) {
    runDesktopBuild();
  }

  for (const task of tasks) {
    runElectronBuilder(task, options);
  }

  generateUpdateManifest(options);
}

main();
