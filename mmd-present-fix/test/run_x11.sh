#!/bin/sh
# run the partial present test with the Wine build given as $1 (default /home/user/wine-build) on Xvfb
WINE=${1:-/home/user/wine-build}/wine
export DISPLAY=${DISPLAY:-:99} WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml="
cd "$(dirname "$0")"
for mode in discard flip copy; do
    for variant in full "" nochild switch stretch; do
        timeout 100 $WINE partial_present.exe $mode $variant 2>&1 | grep -v libEGL | grep -E "FAIL|mode"
    done
done
