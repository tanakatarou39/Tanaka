#!/bin/sh
# Run effect_test.exe under Wine with the vkd3d based d3dcompiler_47.
export WINEPREFIX=/home/user/wineprefix
export WINEDEBUG=${WINEDEBUG:--all}
export WINEDLLOVERRIDES="d3dcompiler_47=n;winedbg.exe=d"
cd /home/user/wtest
timeout 300 xvfb-run -a -s "-screen 0 1024x768x24" wine effect_test.exe "$@"
rc=$?
wineserver -k 2>/dev/null
exit $rc
