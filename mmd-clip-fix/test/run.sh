#!/bin/sh
# Builds and runs the tests on Linux (mingw-w64 and Wine are needed for region_test).
set -e
cd "$(dirname "$0")"
NEW=${1:-../new}
python3 extract.py $NEW/wine/dlls/wineandroid.drv/client.c clip_order compare_clip_order reduce_clip_rects scale_clip_rects get_region_clip > client_clip.inc
python3 extract.py $NEW/app/jni/server.c req_client_clip > server_clip.inc
python3 extract.py $NEW/app/jni/render.c draw_client_surfaces >> server_clip.inc
x86_64-w64-mingw32-gcc -O2 -Wall -o region_test.exe region_test.c -lgdi32
gcc -O2 -Wall -Wno-unused-function -o server_test server_test.c
WINEDEBUG=-all wine region_test.exe clips.txt > region_test.log
tail -n 1 region_test.log
./server_test clips.txt | tee server_test.log | tail -n 1
echo "old client behaviour (no clip above 64 rects):"
OLD_LIMIT=1 ./server_test clips.txt | tail -n 1 || true
