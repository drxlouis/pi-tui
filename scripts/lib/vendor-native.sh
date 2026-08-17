# Shared by the platform build scripts. Requires $ROOT_DIR and $OPENTUI_VERSION to be set.
#
# @opentui/core loads a platform-specific native module at runtime (e.g.
# @opentui/core-linux-arm64), and bun's installer only ever installs the one matching the
# machine you're on. Cross-compiling for another OS/arch needs that package's files present on
# disk even though it can never run here — this fetches it straight from the npm registry just
# long enough to bundle, then the caller removes it again.
#
# Usage: vendor_native_module "core-linux-arm64"
# Sets VENDOR_DIR (path to the module) and VENDOR_CLEANUP (1 if the caller should rm -rf it after).
vendor_native_module() {
  local short_name="$1"
  VENDOR_DIR="$ROOT_DIR/node_modules/@opentui/$short_name"
  VENDOR_CLEANUP=0

  if [ -d "$VENDOR_DIR" ]; then
    return
  fi

  echo "==> Fetching @opentui/$short_name (needed only for cross-compiling)"
  local tmp
  tmp="$(mktemp -d)"
  curl -sL "https://registry.npmjs.org/@opentui/${short_name}/-/${short_name}-${OPENTUI_VERSION}.tgz" \
    | tar -xz -C "$tmp"
  mkdir -p "$VENDOR_DIR"
  cp -R "$tmp/package/." "$VENDOR_DIR/"
  rm -rf "$tmp"
  VENDOR_CLEANUP=1
}
