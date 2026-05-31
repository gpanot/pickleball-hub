#!/bin/sh
# Patches Pods.xcodeproj to fix "No such file or directory" errors when
# the project path contains spaces (e.g. "Scraprer Reclub").
# Run this after every `pod install` or `expo prebuild`.
set -e

PBXPROJ="$(dirname "$0")/../ios/Pods/Pods.xcodeproj/project.pbxproj"

if [ ! -f "$PBXPROJ" ]; then
  echo "[patch-pods-space] Pods.xcodeproj not found, skipping."
  exit 0
fi

python3 - "$PBXPROJ" << 'PYEOF'
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()

patches = [
    (
        '/bin/sh -c \\"$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT\\"',
        '/bin/sh \\"$WITH_ENVIRONMENT\\" \\"$SCRIPT_PHASES_SCRIPT\\"',
    ),
    (
        'bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"',
        'bash -l \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"',
    ),
]

changed = 0
for old, new in patches:
    count = content.count(old)
    if count:
        content = content.replace(old, new)
        changed += count
        print(f'[patch-pods-space] Applied: {old[:60]}... ({count}x)')

if changed:
    with open(path, 'w') as f:
        f.write(content)
    print(f'[patch-pods-space] ✅ {changed} patch(es) applied.')
else:
    print('[patch-pods-space] ✅ Already patched, nothing to do.')
PYEOF
