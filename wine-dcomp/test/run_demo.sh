#!/bin/sh
# Run demo.exe on a private Xvfb and read the real X screen pixel at the window.
export WINEPREFIX=/home/user/wineprefix-dcomp WINEDLLOVERRIDES="mscoree,mshtml=" WINEDEBUG=${WINEDEBUG:--all} DISPLAY=:79
Xvfb :79 -screen 0 1024x768x24 >/dev/null 2>&1 & xpid=$!
sleep 1
/home/user/wine-build/wine /home/user/work/dcomp/demo.exe > /tmp/demo.out 2>/tmp/demo.err &
sleep 5
cat /tmp/demo.out
pt=$(grep pt /tmp/demo.out | head -1)
x=$(echo $pt | cut -d' ' -f2); y=$(echo $pt | cut -d' ' -f3)
import -window root -crop 1x1+$x+$y txt:- 2>/dev/null | tail -1
import -window root -crop 300x300+0+0 /tmp/demo.png
wait $!
/home/user/wine-build/server/wineserver -k 2>/dev/null
kill $xpid
