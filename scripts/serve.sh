#!/bin/bash

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export LANG="zh_CN.UTF-8"

cd "/Users/majinli/mycodex/AI开发项目/知识库平台"

exec npm run dev -- --host 127.0.0.1 --port 5173
