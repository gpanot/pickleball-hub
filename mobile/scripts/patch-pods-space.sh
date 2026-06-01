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

original = content

# Fix: /bin/sh -c \"$X $Y\" → /bin/sh \"$X\" \"$Y\"
content = content.replace(
    '/bin/sh -c \\"$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT\\"',
    '/bin/sh \\"$WITH_ENVIRONMENT\\" \\"$SCRIPT_PHASES_SCRIPT\\"'
)

# Fix: bash -l -c \"$PATH/script\" → bash -l \"$PATH/script\"
# Match all bash -l -c patterns (not just specific script names)
import re
content = re.sub(
    r'bash -l -c (\\"[^"]*\\")',
    r'bash -l \1',
    content
)

if content != original:
    with open(path, 'w') as f:
        f.write(content)
    print('[patch-pods-space] ✅ Fixed shell script phases with unquoted paths.')
else:
    print('[patch-pods-space] ✅ Already patched, nothing to do.')
PYEOF
