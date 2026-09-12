#!/usr/bin/env bash
# 把 second-body.ptoq.io 绑到这个 Vercel 项目上。
#
# 为什么是一个脚本而不是让人点后台：这件事要做两次（预览域和生产域），
# 而且以后换名字还要再来一遍。点后台的步骤没人会记得，脚本会。
#
# 用法：
#   export VERCEL_TOKEN=...        # https://vercel.com/account/tokens 生成，作用域选这个项目
#   bash scripts/set-domain.sh
#
# token 只活在你自己的 shell 里，不进仓库、不进日志。
set -euo pipefail

: "${VERCEL_TOKEN:?先 export VERCEL_TOKEN}"
PROJECT="${PROJECT:-second-body}"
DOMAIN="${DOMAIN:-second-body.ptoq.io}"
API="https://api.vercel.com"
AUTH=(-H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json")

# 个人账号没有 teamId，团队账号有。自动探测，省得手填。
TEAM=$(curl -s "${AUTH[@]}" "$API/v2/teams" | python3 -c "
import sys,json
t=json.load(sys.stdin).get('teams') or []
print(t[0]['id'] if t else '')" 2>/dev/null || true)
Q=""; [ -n "$TEAM" ] && Q="?teamId=$TEAM"

echo "项目 $PROJECT · 域名 $DOMAIN ${TEAM:+· team $TEAM}"

RES=$(curl -s -X POST "${AUTH[@]}" "$API/v10/projects/$PROJECT/domains$Q" \
  -d "{\"name\":\"$DOMAIN\"}")
echo "$RES" | python3 -m json.tool 2>/dev/null || echo "$RES"

echo
echo "如果上面报 'domain not found'，说明 ptoq.io 还没加进这个 Vercel 账号；"
echo "先在后台把 ptoq.io 加为域名，再重跑本脚本。"
echo "如果报 verification required，把返回里的 CNAME/TXT 记录加到 ptoq.io 的 DNS 上。"
