#!/bin/bash
# 사용법: scripts/devshot.sh OUT W H DPR WAIT [jsf=...]
cd "$(dirname "$0")/.." || exit 1
python3 -m http.server 8123 >/tmp/srv.log 2>&1 &
SRV=$!
sleep 1.2
python3 scripts/shot.py "http://127.0.0.1:8123/index.html?v=36" "$@"
kill $SRV 2>/dev/null
