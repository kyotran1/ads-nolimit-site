#!/bin/bash
# (Re)start a static server for a dist/ folder. Usage: serve.sh [port=4330] [dist=/home/claude/ads-nolimit-v4/dist]
P=${1:-4330}; D=${2:-/home/claude/ads-nolimit-v4/dist}
pkill -f "http.server $P" 2>/dev/null
sleep 0.5
cd "$D" && nohup python3 -m http.server "$P" --bind 127.0.0.1 > /tmp/claude-0/-home-claude/518e96b9-6704-53d2-abe0-181328bc886f/scratchpad/http$P.log 2>&1 &
sleep 1
curl -s -o /dev/null -w "serve %{http_code}\n" http://127.0.0.1:$P/tai-khoan/
