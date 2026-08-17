#!/bin/bash
# Builds a double-clickable "PiTUI.app" that opens Terminal and runs the compiled dashboard.
# Produces a universal (arm64 + x64) binary. Run from anywhere: bash scripts/build-mac-app.sh
set -euo pipefail

APP_NAME="PiTUI"
BUNDLE_ID="com.drxlouis.pitui"
VERSION="1.0.0"
OPENTUI_VERSION="0.3.4"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/$APP_NAME.app"

source "$ROOT_DIR/scripts/lib/vendor-native.sh"

echo "==> Cleaning dist/"
rm -rf "$DIST_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

echo "==> Compiling arm64 binary"
bun build --compile --target=bun-darwin-arm64 \
  --outfile "$DIST_DIR/pi-tui-arm64" "$ROOT_DIR/src/index.ts"

echo "==> Compiling x64 binary"
vendor_native_module "core-darwin-x64"
bun build --compile --target=bun-darwin-x64 \
  --outfile "$DIST_DIR/pi-tui-x64" "$ROOT_DIR/src/index.ts"
[ "$VENDOR_CLEANUP" = "1" ] && rm -rf "$VENDOR_DIR"

echo "==> Combining into a universal binary"
lipo -create -output "$DIST_DIR/pi-tui" "$DIST_DIR/pi-tui-arm64" "$DIST_DIR/pi-tui-x64"
rm "$DIST_DIR/pi-tui-arm64" "$DIST_DIR/pi-tui-x64"

cp "$DIST_DIR/pi-tui" "$APP_DIR/Contents/Resources/pi-tui"
chmod +x "$APP_DIR/Contents/Resources/pi-tui"

echo "==> Writing launcher"
cat > "$APP_DIR/Contents/MacOS/$APP_NAME" <<'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../Resources" && pwd)"
BIN="$DIR/pi-tui"
osascript <<OSA
tell application "Terminal"
    activate
    do script "\"$BIN\""
end tell
OSA
LAUNCHER
chmod +x "$APP_DIR/Contents/MacOS/$APP_NAME"

echo "==> Writing Info.plist"
cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>
    <key>CFBundleVersion</key>
    <string>$VERSION</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleExecutable</key>
    <string>$APP_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.utilities</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
</dict>
</plist>
PLIST

echo "==> Ad-hoc code signing"
codesign --force --deep --sign - "$APP_DIR"

echo "==> Zipping for distribution"
(cd "$DIST_DIR" && zip -qr "$APP_NAME-$VERSION-macOS.zip" "$APP_NAME.app")

echo ""
echo "Done: $APP_DIR"
echo "Zipped: $DIST_DIR/$APP_NAME-$VERSION-macOS.zip"
