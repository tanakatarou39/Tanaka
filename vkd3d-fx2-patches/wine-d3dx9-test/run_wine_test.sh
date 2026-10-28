#!/bin/sh
# Run Wine's d3dx9_36 effect tests; pass "native" to use Wine's own d3dcompiler_47.
export WINEPREFIX=/home/user/wineprefix
export WINEDEBUG=-all
if [ "$1" = "native" ]; then
    export WINEDLLOVERRIDES="d3dcompiler_47=b;winedbg.exe=d"
else
    export WINEDLLOVERRIDES="d3dcompiler_47=n;winedbg.exe=d"
fi
cd /home/user/wtest
timeout 600 xvfb-run -a -s "-screen 0 1024x768x24" wine wine_effect_test.exe effect
rc=$?
wineserver -k 2>/dev/null
exit $rc
