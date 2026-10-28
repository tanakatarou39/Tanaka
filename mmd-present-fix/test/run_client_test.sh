#!/bin/sh
# Builds client_test.exe from the client.c before and after the patch and the display server
# code, and runs it on Wine (mingw-w64 and Wine are needed).
set -e
cd "$(dirname "$0")"
H=../hangover
FUNCS="scale subtract_window clip_order compare_clip_order reduce_clip_rects scale_clip_rects get_region_clip get_client_clip"
python3 extract.py $H/orig/wine/dlls/wineandroid.drv/client.c $FUNCS > client_orig.inc
python3 extract.py $H/new/wine/dlls/wineandroid.drv/client.c $FUNCS > client_new.inc
python3 extract.py $H/app/jni/server.c req_client_clip > server.inc
python3 extract.py $H/app/jni/render.c draw_client_surfaces >> server.inc
x86_64-w64-mingw32-gcc -O2 -Wall -Wno-unused-function -o client_test.exe client_test.c -lgdi32 -luser32
WINEDEBUG=-all ${WINE:-wine} client_test.exe > client_test.log
tail -n 2 client_test.log
