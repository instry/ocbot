const {
  getConfiguredOpenClawVersion,
  getDesktopVersion,
  syncPackageVersionFiles,
} = require('./common.cjs')

function main() {
  const version = getDesktopVersion()
  const openClawVersion = getConfiguredOpenClawVersion()
  const changed = syncPackageVersionFiles()
  console.log(`[version] desktop=${version} openclaw=${openClawVersion}`)
  console.log(changed ? '[version] package metadata updated' : '[version] package metadata already in sync')
}

main()
