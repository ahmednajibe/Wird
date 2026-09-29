#!/usr/bin/env bash
# Installs (or with --uninstall, removes) the Wird desktop menu entry and icon.
# Run from the folder that contains ./wird and wird.png.
set -eu

cd "$(dirname "$0")"

XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
ICON_DIR="$XDG_DATA/icons/hicolor/256x256/apps"
APPS_DIR="$XDG_DATA/applications"
ICON_DST="$ICON_DIR/wird.png"
DESKTOP_DST="$APPS_DIR/wird.desktop"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$DESKTOP_DST" "$ICON_DST"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" 2>/dev/null || true
  echo "Removed $DESKTOP_DST"
  echo "Removed $ICON_DST"
  exit 0
fi

if [ ! -f ./wird ] || [ ! -f ./wird.png ]; then
  echo "Run this script from the folder that contains wird and wird.png." >&2
  exit 1
fi
if [ ! -f ./wird.desktop ]; then
  echo "wird.desktop template is missing from this folder." >&2
  exit 1
fi

EXE="$(cd "$(dirname ./wird)" && pwd)/$(basename ./wird)"

# The Exec key is a command line, not a raw path: quote it if it contains
# spaces or characters the desktop spec treats specially.
EXEC="$EXE"
case "$EXE" in
  *[[:space:]\"\'\\]*)
    EXEC="\"$(printf '%s' "$EXE" | sed 's/\\/\\\\/g; s/"/\\"/g')\""
    ;;
esac

mkdir -p "$ICON_DIR" "$APPS_DIR"
cp ./wird.png "$ICON_DST"
sed "s|@EXEC@|$EXEC|" ./wird.desktop > "$DESKTOP_DST"
chmod 644 "$DESKTOP_DST" "$ICON_DST"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$XDG_DATA/icons/hicolor" 2>/dev/null || true

echo "Installed menu entry: $DESKTOP_DST"
echo "Installed icon:       $ICON_DST"
echo "Remove them with: ./install-desktop-entry.sh --uninstall"
