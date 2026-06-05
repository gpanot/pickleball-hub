const { withAndroidManifest } = require('@expo/config-plugins')

/** Resolve FCM meta-data conflicts between expo-notifications and @react-native-firebase/messaging after prebuild. */
module.exports = function withFcmManifestFix(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'

    const application = manifest.manifest.application?.[0]
    if (!application?.['meta-data']) return cfg

    for (const item of application['meta-data']) {
      const name = item.$['android:name']
      if (name === 'com.google.firebase.messaging.default_notification_channel_id') {
        item.$['tools:replace'] = 'android:value'
      }
      if (name === 'com.google.firebase.messaging.default_notification_color') {
        item.$['tools:replace'] = 'android:resource'
      }
      if (name === 'com.google.firebase.messaging.default_notification_icon') {
        item.$['tools:replace'] = 'android:resource'
      }
    }

    return cfg
  })
}
