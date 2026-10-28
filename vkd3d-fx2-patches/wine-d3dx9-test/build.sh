#!/bin/sh
# Rebuild the vkd3d PE DLLs and the test program.
set -e
make -C /home/user/vkd3d/build-mingw -j6 libvkd3d-shader.la libvkd3d.la libvkd3d-utils.la >/dev/null
cp /home/user/vkd3d/build-mingw/.libs/*.dll /home/user/wtest/
cd /home/user/wtest
x86_64-w64-mingw32-gcc -O0 -g -Wall -o effect_test.exe effect_test.c -ld3d9
