#!/usr/bin/env bash
# build-run.sh — 构建并运行完整的 Kimi Code 桌面客户端（Tauri + 内嵌 agent）。
#
# 这是完整客户端（非 web 版）：生产前端 + Rust release 二进制 + 随包内嵌
# agent（SEA）。启动后应用会自起私有 agent（独立 home + 随机端口），无需
# 任何外部 daemon。
#
# 用法：
#   bash scripts/build-run.sh              # 完整检查、构建并独立启动
#   bash scripts/build-run.sh --foreground # 完整构建并前台运行，Ctrl+C 退出
#   bash scripts/build-run.sh --no-run     # 只检查和构建，不启动
#   bash scripts/build-run.sh --help
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
PKG="@moonshot-ai/kimi-desktop-tauri"
CLI_PKG="@moonshot-ai/kimi-code"
NO_RUN=0
FOREGROUND=0

usage() {
  sed -n '5,12p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --) ;;
    --no-run) NO_RUN=1 ;;
    --foreground) FOREGROUND=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "error: unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

command -v pnpm >/dev/null 2>&1 || { echo "error: pnpm is required" >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "error: cargo is required" >&2; exit 1; }

# ---- 平台目标（与 sea_path.rs 的命名一致） ----
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)        TARGET="linux-x64" ;;
  Linux-aarch64)       TARGET="linux-arm64" ;;
  Darwin-arm64)        TARGET="darwin-arm64" ;;
  Darwin-x86_64)       TARGET="darwin-x64" ;;
  MINGW*-x86_64|MSYS*-x86_64|CYGWIN*-x86_64) TARGET="win32-x64" ;;
  *) echo "unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
EXE="kimi"
[[ "$TARGET" == win32-* ]] && EXE="kimi.exe"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

# ---- 1. 确保内嵌 agent（SEA）存在 ----
SEA_SRC="$REPO_ROOT/apps/kimi-code/dist-native/bin/$TARGET/$EXE"
if [[ ! -x "$SEA_SRC" ]]; then
  if [[ -x "$HOME/.kimi-code/bin/$EXE" ]]; then
    SEA_SRC="$HOME/.kimi-code/bin/$EXE"
  else
    log "构建内嵌 agent（SEA，首次约需数分钟）…"
    pnpm --filter "$CLI_PKG" run build:native:sea
  fi
fi
if [[ ! -x "$SEA_SRC" ]]; then
  echo "error: SEA binary not found at $SEA_SRC" >&2
  exit 1
fi
log "内嵌 agent: $SEA_SRC"

# ---- 2. 前端完整检查（Svelte diagnostics） ----
log "检查前端类型（svelte-check）…"
pnpm --filter "$PKG" run typecheck

# ---- 3. 前端生产构建（vite → dist/） ----
log "构建前端（vite production）…"
pnpm --filter "$PKG" run build

# ---- 4. Rust 完整检查 ----
log "检查客户端 Rust 代码（cargo check）…"
cargo check --manifest-path "$APP_DIR/src-tauri/Cargo.toml" --no-default-features

# ---- 5. Rust release 构建 ----
# 必须显式启用 custom-protocol feature：tauri 的 build.rs 以
# `dev = !custom_protocol` 判定工作模式。直接 cargo build 不带该 feature 时
# 产物是 dev 模式（加载 devUrl localhost:1420 而非内嵌前端），表现为
# WebKit 报 "connect to localhost: Connection refused" 白屏。
log "构建客户端（cargo --release --features custom-protocol）…"
cargo build --release --features custom-protocol --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

# ---- 6. 为直接运行的二进制配备内嵌 agent ----
# release 二进制在解析 SEA 时走 <exe_dir>/bin/<target>/kimi（resource_dir），
# 因此把 SEA 放到 target/release/bin/<target>/ 下，客户端开箱即用。
DEST="$APP_DIR/src-tauri/target/release/bin/$TARGET"
mkdir -p "$DEST"
cp -f "$SEA_SRC" "$DEST/$EXE"
chmod +x "$DEST/$EXE" 2>/dev/null || true
log "agent 已配备: $DEST/$EXE"

if [[ "$NO_RUN" == "1" ]]; then
  log "构建完成（--no-run）。二进制: $APP_DIR/src-tauri/target/release/kimi-desktop-tauri"
  exit 0
fi

# ---- 7. 启动完整客户端 ----
# 关键：必须用 setsid 脱离当前 shell 的进程组/会话（尤其经 ZCode 等 agent
# 启动器拉起时）——否则窗口会被宿主进程树托管、不可见或随宿主退出被杀。
BIN="$APP_DIR/src-tauri/target/release/kimi-desktop-tauri"
[[ "$TARGET" == win32-* ]] && BIN="$BIN.exe"
LOG="/tmp/kimi-desktop-tauri.log"
# 清除会从启动器/宿主（如 ZCode AppImage）继承的环境标记，否则 KDE 会按
# CHROME_DESKTOP 把本窗口归到宿主的 .desktop 组里（任务栏与宿主混在一起）。
if [[ "$FOREGROUND" == "1" ]]; then
  log "前台启动客户端（Ctrl+C 退出）…"
  exec env -u CHROME_DESKTOP -u APPIMAGE -u APPDIR "$BIN"
fi

setsid -f env -u CHROME_DESKTOP -u APPIMAGE -u APPDIR "$BIN" >"$LOG" 2>&1 < /dev/null
sleep 2
CLIENT_PID="$(pgrep -f "release/kimi-desktop-tauri" | head -1 || true)"
log "客户端已作为独立进程启动（pid: ${CLIENT_PID:-unknown}，ppid=init，不随本脚本/启动器退出）"
log "日志: $LOG · 停止: kill ${CLIENT_PID:-<pid>}"
