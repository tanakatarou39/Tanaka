#!/bin/sh
# Run probe2.exe variant $1 on a private Xvfb and print the real X screen pixel.
export WINEPREFIX=/home/user/wineprefix-dcomp WINEDLLOVERRIDES="mscoree,mshtml=" WINEDEBUG=-all DISPLAY=:77
Xvfb :77 -screen 0 1024x768x24 >/dev/null 2>&1 & xpid=$!
sleep 1
/home/user/wine-build/wine /home/user/work/dcomp/probe2.exe $1 > /tmp/probe2.out 2>/dev/null &
sleep 3
pt=$(grep pt /tmp/probe2.out | head -1)
x=$(echo $pt | cut -d' ' -f2); y=$(echo $pt | cut -d' ' -f3)
echo "variant $1 $(grep ulw /tmp/probe2.out) at $x,$y: $(import -window root -crop 1x1+$x+$y txt:- 2>/dev/null | tail -1)"
wait $!
kill $xpid
