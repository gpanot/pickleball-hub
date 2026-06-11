# iOS Xcode Build Runbook (Expo/RN SDK upgrades)

Short checklist to keep iOS builds stable after Expo SDK / React Native / pod updates.

## Scope

Applies to `mobile/ios` in this repo, especially when upgrading:
- Expo SDK
- React Native
- CocoaPods dependencies

## Golden workflow after any upgrade

1. From `mobile/ios`, run:
   ```bash
   pod install
   ```
2. Open `mobile/ios/SQUADD.xcworkspace` (not `.xcodeproj`).
3. In Xcode: `Product -> Clean Build Folder`.
4. Build again.

## Required project config (already implemented)

### 1) Space-in-path safe scripts

If repo path contains spaces (example: `Scraprer Reclub`), shell phases must be quoted.

- Script: `mobile/scripts/patch-pods-space.sh`
- It is called automatically from `mobile/ios/Podfile` (`post_integrate`).
- It patches:
  - `Pods/Pods.xcodeproj/project.pbxproj`
  - `SQUADD.xcodeproj/project.pbxproj`
  - `Pods/fmt/include/fmt/base.h` (see fmt fix below)

### 2) Podfile settings

In `mobile/ios/Podfile`:
- Keep Firebase modular headers targeted (no global `use_modular_headers!`):
  - `GoogleUtilities`, `FirebaseCore`, `FirebaseCoreInternal`, `FirebaseInstallations`, `FirebaseMessaging`, `GoogleDataTransport`, `nanopb`
- Keep explicit modules disabled in post-install for pod/user targets:
  - `CLANG_ENABLE_EXPLICIT_MODULES = NO`
  - `SWIFT_ENABLE_EXPLICIT_MODULES = NO`
- Keep C++ standard forced for Pods project-level configs:
  - `CLANG_CXX_LANGUAGE_STANDARD = gnu++20`
- Keep fmt preprocessor override on target:
  - `FMT_USE_CONSTEVAL=0`

### 3) Why the fmt patch exists

On newer Xcode + libc++ hardening, `fmt` can fail with:
- `format-inl.h`
- `FMT_COMPILE_STRING`
- `call to consteval function ... is not a constant expression`

The post-install define alone is sometimes ignored by upstream header logic, so the patch script also makes `FMT_USE_CONSTEVAL` overrideable in `fmt/base.h`.

## Error -> Fix quick map

- `No such file or directory .../Scraprer`
  - Cause: unquoted shell phase paths.
  - Fix: run `pod install` (auto-runs patch script), then rebuild.

- `Redefinition of module 'ReactCommon'`
  - Cause: global `use_modular_headers!`.
  - Fix: use targeted Firebase modular headers only (current Podfile already does this), then `pod install`.

- `dev-menu-packager-host` / `Inter-SemiBold.otf` missing (expo-dev-menu)
  - Cause: stale `Pods.xcodeproj` references after dependency changes.
  - Fix: `pod install` to regenerate Pods project.

- `Could not compute dependency graph ... PIF transfer session`
  - Cause: stale Xcode cache/session lock.
  - Fix:
    ```bash
    rm -rf ~/Library/Developer/Xcode/DerivedData/SQUADD-*
    rm -rf ~/Library/Caches/com.apple.dt.Xcode
    ```
    Reopen Xcode and rebuild.

- `fmt ... consteval ... not a constant expression`
  - Fix order:
    1. `pod install` (ensures Podfile + patch script re-applied)
    2. Clean build folder
    3. Rebuild

- `-[EXExpoAppDelegate window]: unrecognized selector sent to instance`
  - Cause: `@react-native-firebase/messaging` code path assumes `UIApplication.sharedApplication.delegate.window` exists; Expo app delegate does not guarantee that selector.
  - Fix in repo:
    - Patched `RNFBMessaging+NSNotificationCenter.m` to resolve window safely (supports scene-based apps / Expo delegate).
    - Saved as `mobile/patches/@react-native-firebase+messaging+24.0.0.patch`.
  - Persistence:
    - `postinstall` already runs `patch-package`, so reinstalling deps reapplies this automatically.

- `Cannot find the keyWindow. Make sure to call window.makeKeyAndVisible()` (fatal crash at startup)
  - Cause: `expo-dev-launcher`'s `ExpoDevLauncherAppDelegateSubscriber` calls `fatalError` when the key window isn't available yet. Timing issue with `EXAppDelegateWrapper`.
  - Fix in repo:
    - Patched `ExpoDevLauncherAppDelegateSubscriber.swift` to gracefully return `false` instead of `fatalError`, with scene-based window fallback.
    - Saved as `mobile/patches/expo-dev-launcher+6.0.21.patch`.
  - Persistence:
    - `postinstall` runs `patch-package`, so reinstalling deps reapplies automatically.

- `-[EXExpoAppDelegate window]: unrecognized selector sent to instance` (crash at startup)
  - Cause: `EXExpoAppDelegate` (Expo SDK 54) doesn't declare a `window` property, but `UIApplicationDelegate` protocol defines it as optional. When React Native or other modules access `delegate.window`, the selector is missing and ObjC throws.
  - Fix in repo:
    - Added `@objc public var window: UIWindow?` to `ExpoAppDelegate.swift`.
    - Saved as `mobile/patches/expo+54.0.35.patch`.
  - Persistence:
    - `postinstall` runs `patch-package`, so reinstalling deps reapplies automatically.

## Important safety note

Do **not** run `expo prebuild --clean` unless explicitly approved and backed up first.  
It can wipe native folders and remove local iOS/Android native customizations.
