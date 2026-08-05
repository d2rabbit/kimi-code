#!/usr/bin/env bash
# dev-quick.sh — 测试人员 / 开发者一键启动（零 flag 友好入口）。
#
# 等价于：
#   bash scripts/build-run.sh --foreground --log-level info
#
# 前台运行（Ctrl+C 退出），daemon 写 info 级日志到
# ~/.kimi-code/desktop/server/server.log，便于发消息无响应等问题诊断。
#
# 如需更深诊断：
#   bash scripts/build-run.sh --foreground --log-level debug --debug-endpoints
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENT_LOG="$HOME/.kimi-code/desktop/server/server.log"

printf '\033[1;36m▸ Partial Lunar Eclipse · 快速启动\033[0m\n'
printf '  模式：前台（Ctrl+C 退出）\n'
printf '  daemon 日志：%s\n' "$AGENT_LOG"
printf '  停止：Ctrl+C，或 kill 会话进程\n\n'

# 首次启动提示：日志目录可能还不存在（agent 启动后才会创建）。
if [[ ! -d "$(dirname "$AGENT_LOG")" ]]; then
  printf '\033[1;33m⚠ 首次启动：embedded agent 将在 %s 创建日志目录\033[0m\n\n' "$(dirname "$AGENT_LOG")"
fi

# 转发到 build-run.sh，所有诊断参数已预设好。透传用户额外 flag（如 --skip-sea）。
exec bash "$SCRIPT_DIR/build-run.sh" --foreground --log-level info "$@"
