#!/bin/bash
# Cross-compiles standalone Linux binaries (arm64, for Raspberry Pi OS 64-bit, and x64) and
# packages each into a .tar.gz with a terminal-launcher wrapper and a desktop entry installer.
# Run from anywhere: bash scripts/build-linux.sh
set -euo pipefail

APP_NAME="pi-tui"
DISPLAY_NAME="PiTUI"
VERSION="1.0.0"
OPENTUI_VERSION="0.3.4"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

source "$ROOT_DIR/scripts/lib/vendor-native.sh"

echo "==> Cleaning dist/"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

build_arch() {
  local arch="$1" # "arm64" or "x64"
  local pkg_dir="$DIST_DIR/$APP_NAME-$VERSION-linux-$arch"

  echo ""
  echo "==> Compiling linux-$arch binary"
  # @opentui/core resolves either the glibc or musl native module depending on the target libc,
  # and the bundler needs both present on disk to statically resolve that branch either way.
  vendor_native_module "core-linux-$arch"
  local cleanup_a=$VENDOR_CLEANUP dir_a=$VENDOR_DIR
  vendor_native_module "core-linux-$arch-musl"
  local cleanup_b=$VENDOR_CLEANUP dir_b=$VENDOR_DIR

  bun build --compile --target="bun-linux-$arch" \
    --outfile "$DIST_DIR/$APP_NAME" "$ROOT_DIR/src/index.ts"

  [ "$cleanup_a" = "1" ] && rm -rf "$dir_a"
  [ "$cleanup_b" = "1" ] && rm -rf "$dir_b"

  echo "==> Packaging linux-$arch"
  mkdir -p "$pkg_dir"
  mv "$DIST_DIR/$APP_NAME" "$pkg_dir/$APP_NAME"
  chmod +x "$pkg_dir/$APP_NAME"

  cat > "$pkg_dir/run-in-terminal.sh" <<'WRAPPER'
#!/bin/bash
# Opens the dashboard in a terminal window — for double-clicking from a file manager, or for
# kiosk autostart. Running the "pi-tui" binary directly works too if you're already in a
# terminal. If xdotool is installed, the window is pushed fullscreen shortly after opening
# (nice for a dedicated kiosk screen); harmless no-op otherwise.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$DIR/pi-tui"

for term in x-terminal-emulator lxterminal gnome-terminal xfce4-terminal konsole xterm; do
  if command -v "$term" >/dev/null 2>&1; then
    ( sleep 1; command -v xdotool >/dev/null 2>&1 && xdotool getactivewindow windowstate --add FULLSCREEN ) &
    exec "$term" -e "$BIN"
  fi
done

# No terminal emulator found — assume we're already in one (e.g. launched over SSH).
exec "$BIN"
WRAPPER
  chmod +x "$pkg_dir/run-in-terminal.sh"

  cat > "$pkg_dir/install-desktop-entry.sh" <<INSTALLER
#!/bin/bash
# Adds a "$DISPLAY_NAME" entry to your applications menu. Pass --autostart to also launch it
# automatically on login (handy for a Raspberry Pi touchscreen kiosk).
set -euo pipefail
DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "\$HOME/.local/share/applications"
cat > "\$HOME/.local/share/applications/$APP_NAME.desktop" <<ENTRY
[Desktop Entry]
Type=Application
Name=$DISPLAY_NAME
Comment=Football, stocks, news, calendar and weather dashboard
Exec=\$DIR/run-in-terminal.sh
Icon=utilities-terminal
Terminal=false
Categories=Utility;
ENTRY

echo "Installed: \$HOME/.local/share/applications/$APP_NAME.desktop"

if [ "\${1:-}" = "--autostart" ]; then
  mkdir -p "\$HOME/.config/autostart"
  cp "\$HOME/.local/share/applications/$APP_NAME.desktop" "\$HOME/.config/autostart/$APP_NAME.desktop"
  echo "Autostart enabled: \$HOME/.config/autostart/$APP_NAME.desktop"

  # LXDE's own session manager (lxsession) doesn't reliably pick up XDG ~/.config/autostart
  # entries in practice — its own autostart file (with the required "@" prefix, which also
  # means "relaunch if it exits", handy for a kiosk) is the mechanism that actually works.
  if command -v lxsession >/dev/null 2>&1; then
    mkdir -p "\$HOME/.config/lxsession/LXDE"
    AUTOSTART_FILE="\$HOME/.config/lxsession/LXDE/autostart"
    touch "\$AUTOSTART_FILE"
    sed -i "\\|\$DIR/run-in-terminal.sh|d" "\$AUTOSTART_FILE"
    echo "@\$DIR/run-in-terminal.sh" >> "\$AUTOSTART_FILE"
    echo "LXDE autostart enabled: \$AUTOSTART_FILE"
  fi
fi
INSTALLER
  chmod +x "$pkg_dir/install-desktop-entry.sh"

  cat > "$pkg_dir/README.txt" <<README
$DISPLAY_NAME ($arch)

Quick start:
  ./pi-tui                     Run directly in your current terminal
  ./run-in-terminal.sh         Open in a new terminal window (for double-clicking)
  ./install-desktop-entry.sh   Add a "$DISPLAY_NAME" entry to your applications menu
  ./install-desktop-entry.sh --autostart
                                Also launch it automatically on login (Pi kiosk setups)

Configuration (calendar, weather city) is read from a .env file in the directory you run it
from, or from real environment variables. See the project README for the full list.

Kiosk / touchscreen setup on a fresh, minimal Debian install (no desktop environment yet)?
See "Linux desktop environment (kiosk setup)" in the project README for the full walkthrough,
including two easy-to-miss dependencies: xfonts-base (lxterminal needs it to even start) and
xdotool (only needed if you want the window to open fullscreen automatically).
README

  (cd "$DIST_DIR" && tar -czf "$APP_NAME-$VERSION-linux-$arch.tar.gz" "$(basename "$pkg_dir")")
  rm -rf "$pkg_dir"
}

build_arch "arm64"
build_arch "x64"

echo ""
echo "Done:"
echo "  $DIST_DIR/$APP_NAME-$VERSION-linux-arm64.tar.gz  (Raspberry Pi OS 64-bit and other ARM64 Linux)"
echo "  $DIST_DIR/$APP_NAME-$VERSION-linux-x64.tar.gz     (regular 64-bit Linux PCs)"
