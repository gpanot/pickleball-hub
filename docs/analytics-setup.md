# Analytics Setup — Squadd Mobile App

## 1. PostHog (Product Analytics + Session Replay)

**Dashboard:** https://us.posthog.com  
**SDK:** `posthog-react-native` + `posthog-react-native-session-replay`  
**API Key:** `phc_uZqiFnt6NpnpjL3QPbD4RmpJZaByiJChD5pcrcySXjGJ`  
**Host:** `https://us.i.posthog.com`

### What it does
- **Autocapture** — taps, screen views, navigation events
- **Session Replay** — records user sessions on Android/iOS (not Expo Go)
- **Feature Flags** — remote toggles
- **Surveys** — in-app surveys (requires `react-native-safe-area-context` + `react-native-svg`)

### Configuration (App.tsx)
```tsx
<PostHogProvider
  apiKey="phc_uZq..."
  options={{
    host: "https://us.i.posthog.com",
    enableSessionReplay: true,
    sessionReplayConfig: {
      maskAllTextInputs: true,   // passwords always masked
      maskAllImages: false,
      captureLog: true,
      androidDebouncerDelayMs: 500,
      iOSDebouncerDelayMs: 500,
    },
  }}
  autocapture
/>
```

### Privacy masking
- `ProfileSheet` and `GearSetupScreen` are wrapped in `<PostHogMaskView>` to hide personal data from session recordings.

### Required Expo peer deps
```
expo-file-system, expo-application, expo-device, expo-localization
```

### Metro config
`metro.config.js` has `unstable_enablePackageExports = true` — required for `@posthog/core` subpath imports.

### Session Replay requirements
- Android API 26+ / iOS 13+
- Does NOT work in Expo Go — requires dev build or production APK
- Must enable "Record user sessions" in PostHog Project Settings → Session Replay

---

## 2. UXCam (Session Recording + Heatmaps)

**Dashboard:** https://app.uxcam.com  
**SDK:** `react-native-ux-cam`  
**App Key:** `fex34xqkmrtg0cv-us`

### What it does
- **Session Recording** — full video replay of user sessions
- **Heatmaps** — tap/gesture heatmaps per screen
- **User Journey** — flow analysis between screens

### Configuration (App.tsx)
```tsx
RNUxcam.optIntoSchematicRecordings()
RNUxcam.startWithConfiguration({
  userAppKey: 'fex34xqkmrtg0cv-us',
  enableAutomaticScreenNameTagging: false,
  enableImprovedScreenCapture: true,
})
```

### Important notes
- UXCam is a **native module** — does NOT work in Expo Go
- Import is wrapped in `try/catch` via lazy `require()` to avoid crashes in Expo Go
- Only active in dev builds and production APKs

---

## 3. Build notes

### Kotlin version
`android/build.gradle` uses `kotlinVersion = '1.9.25'` (pinned by Expo/RN).  
The `posthog-react-native-session-replay` plugin pulls in `kotlin-stdlib:2.1.10` transitively, which causes metadata version mismatch errors.

**Fix:** `allprojects.configurations.all` in `build.gradle` forces `kotlin-stdlib*` to match `kotlinVersion`, preventing the 2.1.x stdlib from being resolved.

### Gradle cache
If Kotlin version mismatch errors recur, clear caches:
```bash
cd android && ./gradlew clean
```
