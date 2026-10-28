#!/bin/sh
# Restore the prebuilt Wine / vkd3d trees from the GitHub release into /home/user,
# so that only the files changed since then need to be rebuilt.
#
#   sh restore-build-cache.sh [tag]
#
# The trees must stay at /home/user/<name>: the build directories refer to them.
set -e

TAG=${1:-build-cache-2026-10-28}
REPO=tanakatarou39/Tanaka
DEST=/home/user
WORK=$(mktemp -d)

# build dependencies (Ubuntu 24.04)
if command -v apt-get >/dev/null; then
    apt-get update -qq || true
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        zstd flex bison gcc-mingw-w64 mingw-w64 wine64 wine64-tools spirv-headers \
        libvulkan-dev libx11-dev libfreetype-dev xvfb >/dev/null
fi

cd "$WORK"
if command -v gh >/dev/null && gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
    gh release download "$TAG" -R "$REPO" -p '*.zst*' -p 'SHA256SUMS'
else
    for f in $(curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$TAG" |
               sed -n 's/.*"browser_download_url": *"\([^"]*\)".*/\1/p'); do
        curl -fL --retry 4 -O "$f"
    done
fi
sha256sum -c SHA256SUMS

for name in wine-src-build vkd3d-work; do
    ls "$name".tar.zst.part-* >/dev/null 2>&1 || continue
    echo "extracting $name"
    cat "$name".tar.zst.part-* | zstd -d --long=27 -q | tar -xf - -C "$DEST"
done
rm -rf "$WORK"

cat <<MSG
Restored into $DEST:
  wine-src    upstream Wine (branch d3dkmt-priority), wine-build: 64-bit build of it
  vkd3d       vkd3d (branch fx2-state-assignments), build/ and build-mingw/
To update Wine without a full rebuild:
  cd $DEST/wine-src && git pull --rebase origin master && cd ../wine-build && make -j\$(nproc)
MSG
