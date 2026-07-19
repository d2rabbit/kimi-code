#!/usr/bin/env bash
# build-run.sh — 构建 Kimi Code 桌面客户端（Tauri + 内嵌 kimi-code agent）。
#
# 客户端的所有能力都来自 kimi-code 核心（内嵌 SEA = 单文件可执行 agent）。
# 本脚本负责把 kimi-code 源码构建成 SEA，再内嵌进 Tauri 客户端，产出：
#   - 默认 / --no-run / --foreground：可执行的 release 二进制（开发期使用）
#   - --dist：可分发的安装包（.deb/.dmg/.msi/.AppImage，由 Tauri bundler 产出）
#
# 用法：
#   bash scripts/build-run.sh               # 完整构建 + 独立启动（后台 setsid）
#   bash scripts/build-run.sh --foreground  # 完整构建 + 前台运行（Ctrl+C 退出）
#   bash scripts/build-run.sh --no-run      # 只构建，不启动
#   bash scripts/build-run.sh --dist        # 构建并打包成安装包（产出 bundle/）
#   bash scripts/build-run.sh --dist --skip-sea   # 打包，但复用已有 SEA（不重编 kimi-code）
#   bash scripts/build-run.sh --log-level debug   # 诊断模式：daemon 写 debug 级日志
#   bash scripts/build-run.sh --debug-endpoints   # 挂载 /api/v1/debug/* 内省路由
#   bash scripts/build-run.sh --help
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
PKG="@moonshot-ai/kimi-desktop-tauri"
CLI_PKG="@moonshot-ai/kimi-code"
WEB_PKG="@moonshot-ai/kimi-web"
NO_RUN=0
FOREGROUND=0
DIST=0
SKIP_SEA=0
# Daemon log level (fatal|error|warn|info|debug|trace|silent). Default `info`
# records turn processing / model calls / MCP connections to server.log so
# prompt failures are diagnosable. Override with --log-level when reproducing.
LOG_LEVEL="${KIMI_DESKTOP_LOG_LEVEL:-info}"
DEBUG_ENDPOINTS=0

usage() {
  sed -n '5,17p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift; break ;;
    --no-run) NO_RUN=1; shift ;;
    --foreground) FOREGROUND=1; shift ;;
    --dist) DIST=1; shift ;;
    --skip-sea) SKIP_SEA=1; shift ;;
    --log-level)
      [[ $# -ge 2 ]] || { echo "error: --log-level requires a value" >&2; exit 2; }
      LOG_LEVEL="$2"; shift 2 ;;
    --debug-endpoints) DEBUG_ENDPOINTS=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "error: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# 互斥校验：打包模式不存在「运行」概念
if [[ "$DIST" == "1" && ("$FOREGROUND" == "1" || "$NO_RUN" == "1") ]]; then
  echo "error: --dist cannot be combined with --foreground or --no-run" >&2
  usage >&2
  exit 2
fi

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
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2; }
err()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; }

# ---- 1. 构建内嵌 agent（SEA，始终从 kimi-code 源码构建） ----
# SEA = Single Executable Application。客户端运行时自起私有 agent（独立 home +
# 随机端口），无需任何外部 daemon。SEA 的构建链路：
#   kimi-web 构建 → copy-web-assets → kimi-code SEA 打包（bundle/blob/inject/sign）
# 缺少前置的 dist-web/ 会让 02-sea-blob.mjs 报错，因此每次都重新拷贝。
SEA_SRC="$REPO_ROOT/apps/kimi-code/dist-native/bin/$TARGET/$EXE"

if [[ "$SKIP_SEA" == "1" ]]; then
  if [[ ! -x "$SEA_SRC" ]]; then
    err "SEA binary not found at $SEA_SRC (--skip-sea requires an existing build)"
    exit 1
  fi
  log "复用已有 SEA（--skip-sea）: $SEA_SRC"
else
  log "构建 kimi-web 前端（SEA 内嵌用）…"
  pnpm --filter "$WEB_PKG" run build

  log "拷贝 kimi-web 资源到 kimi-code/dist-web …"
  node "$REPO_ROOT/apps/kimi-code/scripts/copy-web-assets.mjs"

  log "构建内嵌 agent（SEA，首次约需 5–10 分钟）…"
  pnpm --filter "$CLI_PKG" run build:native:sea

  if [[ ! -x "$SEA_SRC" ]]; then
    err "SEA build finished but binary not found at $SEA_SRC"
    exit 1
  fi
  log "内嵌 agent: $SEA_SRC"
fi

# ---- 2. 前端完整检查（Svelte diagnostics） ----
log "检查前端类型（svelte-check）…"
pnpm --filter "$PKG" run typecheck

# ---- 3. Rust 完整检查 ----
log "检查客户端 Rust 代码（cargo check）…"
cargo check --manifest-path "$APP_DIR/src-tauri/Cargo.toml" --no-default-features

# =====================================================================
# 路径 A：打包模式（--dist）—— 走 Tauri bundler，产出安装包
# =====================================================================
if [[ "$DIST" == "1" ]]; then
  # Tauri 构建链会自动触发：
  #   beforeBuildCommand   = pnpm build            （Svelte 前端 → dist/）
  #   beforeBundleCommand  = node before-bundle.cjs （stage SEA → resources/bin/）
  # bundle.targets = "all"，按当前平台产出全部格式（.deb/.dmg/.msi/.AppImage）。
  log "Tauri 打包（tauri build，产出安装包）…"
  # 透传平台信息给 before-bundle.cjs（与 CI workflow 的环境变量保持一致）。
  export TAURI_PLATFORM="${TARGET%%-*}"
  export TAURI_ARCH="${TARGET#*-}"

  # 不用 set -e 直接退出：Tauri 在某一种 bundle 格式失败时（如 Linux 缺
  # linuxdeploy/patchelf 导致 AppImage 失败）整体返回非零，但其它格式
  # （deb/rpm）可能已成功产出。我们先列出所有产物，再根据情况决定退出码。
  if ! ( cd "$APP_DIR" && pnpm run tauri:build ); then
    TAURI_FAILED=1
  else
    TAURI_FAILED=0
  fi

  BUNDLE_DIR="$APP_DIR/src-tauri/target/release/bundle"
  # 收集所有成功产出的安装包（按时间戳，最新的在前）。
  mapfile -t BUNDLES < <(find "$BUNDLE_DIR" -type f \( \
      -name '*.deb' -o -name '*.dmg' -o -name '*.msi' -o \
      -name '*.AppImage' -o -name '*.exe' -o -name '*.rpm' \) \
      -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)

  if [[ ${#BUNDLES[@]} -gt 0 ]]; then
    if [[ "$TAURI_FAILED" == "1" ]]; then
      warn "Tauri 打包过程出错（可能某种格式失败），但以下产物已成功产出："
    else
      log "打包完成。安装包产物："
    fi
    for f in "${BUNDLES[@]}"; do printf '    %s\n' "$f"; done
  else
    err "未发现任何安装包产物，检查 $BUNDLE_DIR 与上方 Tauri 输出"
  fi

  if [[ "$TAURI_FAILED" == "1" ]]; then
    err "Tauri 打包未完全成功。常见原因："
    err "  Linux AppImage: 缺少 linuxdeploy/patchelf（apt install patchelf，或用 -b appimage 跳过）"
    err "  macOS:          缺少签名身份（APPLE_SIGNING_IDENTITY）"
    err "  Windows:        缺少 WiX Toolset（MSI bundler 依赖）"
    exit 1
  fi
  exit 0
fi

# =====================================================================
# 路径 B：开发期模式 —— 编译裸 release 二进制 + 直接运行
# =====================================================================

# ---- 4. 前端生产构建（vite → dist/） ----
log "构建前端（vite production）…"
pnpm --filter "$PKG" run build

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

# 诊断参数透传给 embedded agent（commands.rs::ensure_server 读取这两个 env）。
# KIMI_DESKTOP_LOG_LEVEL 决定 daemon 写 server.log 的级别；默认 info。
# KIMI_DESKTOP_DEBUG_ENDPOINTS=1 挂载 /api/v1/debug/* 内省路由。
DEBUG_FLAG=""
[[ "$DEBUG_ENDPOINTS" == "1" ]] && DEBUG_FLAG="1"
if [[ "$LOG_LEVEL" != "info" || "$DEBUG_ENDPOINTS" == "1" ]]; then
  log "诊断模式：log-level=$LOG_LEVEL debug-endpoints=$([[ "$DEBUG_ENDPOINTS" == "1" ]] && echo on || echo off)"
  log "  daemon 日志：~/.kimi-code/desktop/server/server.log"
fi

# 清除会从启动器/宿主（如 ZCode AppImage）继承的环境标记，否则 KDE 会按
# CHROME_DESKTOP 把本窗口归到宿主的 .desktop 组里（任务栏与宿主混在一起）。
if [[ "$FOREGROUND" == "1" ]]; then
  log "前台启动客户端（Ctrl+C 退出）…"
  exec env -u CHROME_DESKTOP -u APPIMAGE -u APPDIR \
      KIMI_DESKTOP_LOG_LEVEL="$LOG_LEVEL" \
      KIMI_DESKTOP_DEBUG_ENDPOINTS="$DEBUG_FLAG" \
      "$BIN"
fi

setsid -f env -u CHROME_DESKTOP -u APPIMAGE -u APPDIR \
    KIMI_DESKTOP_LOG_LEVEL="$LOG_LEVEL" \
    KIMI_DESKTOP_DEBUG_ENDPOINTS="$DEBUG_FLAG" \
    "$BIN" >"$LOG" 2>&1 < /dev/null
sleep 2
CLIENT_PID="$(pgrep -f "release/kimi-desktop-tauri" | head -1 || true)"
log "客户端已作为独立进程启动（pid: ${CLIENT_PID:-unknown}，ppid=init，不随本脚本/启动器退出）"
log "日志: $LOG · 停止: kill ${CLIENT_PID:-<pid>}"
