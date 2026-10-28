#!/bin/sh
# Restore the prebuilt Wine / vkd3d trees into /home/user, so that only the files
# changed since then need to be rebuilt. The archives (tar + zstd, split in 95 MB
# parts) are on the build-cache-data branch of tanakatarou39/Tanaka.
#
#   sh restore-build-cache.sh [dest]
#
# The build trees refer to the source trees next to them (../wine-src), keep them together.
set -e

DEST=${1:-/home/user}
REPO=https://github.com/tanakatarou39/Tanaka.git
WORK=$(mktemp -d)

# build dependencies (Ubuntu 24.04)
if command -v apt-get >/dev/null; then
    apt-get update -qq || true
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        zstd flex bison gcc-mingw-w64 mingw-w64 wine64 wine64-tools spirv-headers \
        libvulkan-dev libx11-dev libfreetype-dev xvfb >/dev/null
fi

git clone -q --depth 1 --branch build-cache-data "$REPO" "$WORK/data"
cd "$WORK/data"
sha256sum -c SHA256SUMS

mkdir -p "$DEST"
for name in wine-src-build vkd3d-work; do
    echo "extracting $name into $DEST"
    cat "$name".tar.zst.part-* | zstd -d --long=27 -q | tar -xf - -C "$DEST"
done
cd /
rm -rf "$WORK"

cat <<MSG
Restored into $DEST:
  wine-src    upstream Wine 0738d52 + the D3DKMT patches (branch d3dkmt-priority)
  wine-build  64-bit build of wine-src
  vkd3d       vkd3d (branch fx2-state-assignments), with build/ and build-mingw/
To update Wine without a full rebuild:
  cd $DEST/wine-src && git pull --rebase origin master && cd ../wine-build && make -j\$(nproc)
MSG
