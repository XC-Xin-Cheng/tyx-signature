#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
 printf "请先从 https://nodejs.org/ 安装 Node.js 24 LTS，再重新打开本文件。\n"
 read -r signature_reply
 exit 1
fi
node scripts/start-web.mjs
if [ "$?" -ne 0 ]; then read -r signature_reply; fi
