#!/usr/bin/env bash
# Draws the app icons in public/ from icon.svg and icon-maskable.svg.
# Run it by hand once, after changing the logo; it is not part of the build.
# It uses Microsoft Edge (comes with Windows) in headless mode, so it needs no
# extra packages. Edge's window can't be smaller than ~500px, so every icon
# is drawn in a 512px page and shrunk with the device scale factor.
set -e
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PUBLIC="$(cd ../../public && pwd)"

render() { # svg, size, output name
  local scale
  scale=$(node -e "console.log($2 / 512)")
  "$EDGE" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor="$scale" \
    --window-size=512,512 --screenshot="$(cygpath -w "$PUBLIC/$3")" \
    "file:///$(cygpath -m "$PWD/$1")" 2>/dev/null
}

render icon.svg 512 icon-512.png
render icon.svg 192 icon-192.png
render icon.svg 180 apple-touch-icon.png
render icon.svg 32 favicon.png
render icon-maskable.svg 512 icon-maskable-512.png
