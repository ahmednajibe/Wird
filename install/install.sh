#!/bin/sh
# Wird one-line installer for Linux and macOS.
#   curl -fsSL https://github.com/ahmednajibe/Wird/releases/latest/download/install.sh | sh
# Overrides for testing: WIRD_VERSION, WIRD_ASSET_DIR, WIRD_INSTALL_DIR,
# WIRD_NO_SHORTCUT (macOS), WIRD_NO_LAUNCH.
set -eu

REPO="ahmednajibe/Wird"
RELEASES_URL="https://github.com/$REPO/releases"
# Keep in sync with .nvmrc and the pinned engine version.
NODE_VERSION="24.20.0"

fetch() { # url dest
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    echo "Wird needs curl or wget to download files." >&2
    exit 1
  fi
}

fetch_stdout() { # url
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    echo "Wird needs curl or wget to download files." >&2
    exit 1
  fi
}

sha256_of() { # file
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# check_sum <file> <sums-file>: verify <file> against "<hex>  <name>" in sums.
check_sum() {
  name=$(basename "$1")
  expected=$(awk -v f="$name" '$2 == f {print $1; exit}' "$2")
  if [ -z "$expected" ]; then
    echo "No checksum entry for $name; nothing was installed." >&2
    exit 1
  fi
  actual=$(sha256_of "$1")
  if [ "$actual" != "$expected" ]; then
    echo "Checksum mismatch for $name; nothing was installed." >&2
    exit 1
  fi
}

# asset <name> <dest>: copy from WIRD_ASSET_DIR or download from the release.
asset() {
  if [ -n "${WIRD_ASSET_DIR:-}" ]; then
    cp "$WIRD_ASSET_DIR/$1" "$2"
  else
    fetch "$RELEASES_URL/download/$TAG/$1" "$2"
  fi
}

# version_from_name <glob-pattern-dir> <pattern>: derive version from an
# existing file name when WIRD_ASSET_DIR is used.
derive_version() {
  ls "$WIRD_ASSET_DIR"/Wird-*-"$1" 2>/dev/null | head -n1 | sed "s|.*/Wird-\(.*\)-$1$|\1|"
}

# replace_dir <new-dir> <dest>: move the old dir aside, move the new one in,
# then remove the old one.
replace_dir() {
  if [ -d "$2" ]; then
    mv "$2" "$2.old.$$"
  fi
  mv "$1" "$2"
  rm -rf "$2.old.$$"
}

TAG="${WIRD_VERSION:-}"
if [ -z "$TAG" ]; then
  TAG=$(fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" |
    sed -n 's/.*"tag_name"[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
fi
if [ -z "$TAG" ]; then
  echo "Could not determine the latest Wird release." >&2
  exit 1
fi

OS=$(uname -s)
ARCH=$(uname -m)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/wird-install.XXXXXX")
trap 'rm -rf "$WORK"' EXIT INT TERM HUP

case "$OS" in
  Linux)
    if [ "$ARCH" != "x86_64" ]; then
      echo "Wird is not packaged for Linux/$ARCH yet. Use the source download:" >&2
      echo "  $RELEASES_URL" >&2
      exit 1
    fi
    if [ -n "${WIRD_ASSET_DIR:-}" ]; then
      VER=$(derive_version "linux-x64.tar.gz")
    else
      VER=$(printf '%s' "$TAG" | sed 's/^v//')
    fi
    TAR="Wird-$VER-linux-x64.tar.gz"
    asset "$TAR" "$WORK/$TAR"
    asset "SHA256SUMS.txt" "$WORK/SHA256SUMS.txt"
    check_sum "$WORK/$TAR" "$WORK/SHA256SUMS.txt"

    mkdir -p "$WORK/x"
    tar -xzf "$WORK/$TAR" -C "$WORK/x"
    DEST="${WIRD_INSTALL_DIR:-$HOME/.local/share/wird-app}"
    mkdir -p "$(dirname "$DEST")"
    replace_dir "$WORK/x/Wird-$VER-linux-x64" "$DEST"

    mkdir -p "$HOME/.local/bin"
    ln -sfn "$DEST/wird" "$HOME/.local/bin/wird"
    case ":$PATH:" in
      *":$HOME/.local/bin:"*) ;;
      *) echo "Note: $HOME/.local/bin is not on your PATH." ;;
    esac

    "$DEST/install-desktop-entry.sh" || true

    echo "Wird $VER installed to $DEST"
    echo "Your data lives in ${XDG_DATA_HOME:-$HOME/.local/share}/wird"
    if [ "${WIRD_NO_LAUNCH:-}" != "1" ]; then
      echo "Start Wird from your applications menu or run: wird"
    fi
    ;;

  Darwin)
    case "$ARCH" in
      arm64) NODE_ARCH="darwin-arm64" ;;
      x86_64) NODE_ARCH="darwin-x64" ;;
      *)
        echo "Wird is not packaged for macOS/$ARCH yet. Use the source download:" >&2
        echo "  $RELEASES_URL" >&2
        exit 1
        ;;
    esac

    if [ -n "${WIRD_ASSET_DIR:-}" ]; then
      VER=$(derive_version "app.tar.gz")
    else
      VER=$(printf '%s' "$TAG" | sed 's/^v//')
    fi

    # Portable Node runtime.
    NTAR="node-v$NODE_VERSION-$NODE_ARCH.tar.gz"
    fetch "https://nodejs.org/dist/v$NODE_VERSION/$NTAR" "$WORK/$NTAR"
    fetch "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$WORK/SHASUMS256.txt"
    check_sum "$WORK/$NTAR" "$WORK/SHASUMS256.txt"
    mkdir -p "$WORK/node"
    tar -xzf "$WORK/$NTAR" -C "$WORK/node"

    # App bundle.
    ATAR="Wird-$VER-app.tar.gz"
    asset "$ATAR" "$WORK/$ATAR"
    asset "SHA256SUMS.txt" "$WORK/SHA256SUMS.txt"
    check_sum "$WORK/$ATAR" "$WORK/SHA256SUMS.txt"
    mkdir -p "$WORK/appx"
    tar -xzf "$WORK/$ATAR" -C "$WORK/appx"

    DEST="${WIRD_INSTALL_DIR:-$HOME/Applications/Wird}"
    mkdir -p "$(dirname "$DEST")"
    mkdir -p "$WORK/newdest"
    mv "$WORK/node/node-v$NODE_VERSION-$NODE_ARCH" "$WORK/newdest/node"
    mv "$WORK/appx/Wird-$VER-app" "$WORK/newdest/app"
    # Absolute paths: the Desktop symlink makes "$(dirname "$0")" point at
    # ~/Desktop, not the install dir.
    cat > "$WORK/newdest/Wird.command" <<EOF
#!/bin/bash
cd "$DEST/app" || exit 1
exec "$DEST/node/bin/node" wird.cjs "\$@"
EOF
    chmod +x "$WORK/newdest/Wird.command"
    replace_dir "$WORK/newdest" "$DEST"

    # Double-click launcher on the Desktop. Files fetched with curl are not
    # quarantined, so this does not trigger a Gatekeeper prompt.
    if [ "${WIRD_NO_SHORTCUT:-}" != "1" ] && [ -d "$HOME/Desktop" ]; then
      ln -sfn "$DEST/Wird.command" "$HOME/Desktop/Wird.command"
    fi

    echo "Wird $VER installed to $DEST"
    echo "Your data lives in $HOME/Library/Application Support/Wird"
    if [ "${WIRD_NO_LAUNCH:-}" != "1" ]; then
      open "$DEST/Wird.command" || true
    fi
    ;;

  *)
    echo "Wird is not packaged for $OS yet. Use the source download:" >&2
    echo "  $RELEASES_URL" >&2
    exit 1
    ;;
esac
