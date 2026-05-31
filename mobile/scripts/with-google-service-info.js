/**
 * Expo config plugin that automatically copies GoogleService-Info.plist
 * from the repo root into the iOS target during `expo prebuild`.
 *
 * Source: <workspace-root>/GoogleService-Info.plist
 * Dest:   ios/SQUADD/GoogleService-Info.plist
 */
const { withXcodeProject } = require('@expo/config-plugins')
const path = require('path')
const fs = require('fs')

const withGoogleServiceInfo = (config) => {
  return withXcodeProject(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot
    const platformRoot = cfg.modRequest.platformProjectRoot

    // Source: workspace root (two levels up from mobile/)
    const src = path.resolve(projectRoot, '../../GoogleService-Info.plist')
    // Destination inside the iOS target folder
    const dest = path.join(platformRoot, 'SQUADD', 'GoogleService-Info.plist')

    if (!fs.existsSync(src)) {
      console.warn(
        `[with-google-service-info] ⚠️  Source not found: ${src}\n` +
        `  Download it from Firebase Console and place it at the workspace root.`
      )
      return cfg
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    console.log(`[with-google-service-info] ✅ Copied GoogleService-Info.plist → ${dest}`)

    // Ensure the file is referenced in the Xcode project
    const project = cfg.modResults
    const targetName = 'SQUADD'
    const groupName = targetName

    // Only add if not already present
    const alreadyAdded = project.pbxFileReferenceSection
      ? Object.values(project.pbxFileReferenceSection()).some(
          (f) => f && f.path === '"GoogleService-Info.plist"'
        )
      : false

    if (!alreadyAdded) {
      project.addResourceFile('SQUADD/GoogleService-Info.plist', { target: project.getFirstTarget().uuid }, groupName)
    }

    return cfg
  })
}

module.exports = withGoogleServiceInfo
