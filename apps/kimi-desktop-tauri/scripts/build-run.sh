#!/usr/bin/env bash
# build-run.sh — 构建 Kimi Code 桌面客户端（Tauri + 内嵌 kimi-code agent）。
#
# 客户端的所有能力都来自 kimi-code 核心（tsdown 打包为 main.cjs，用 Node 执行）。
# 本脚本负责把 kimi-code 源码构建成 main.cjs，再配备进 Tauri 客户端，产出：
#   - 默认 / --no-run / --foreground：可执行的 release 二进制（开发期使用）
#   - --dist：可分发的安装包（.deb/.dmg/.msi/.AppImage，由 Tauri bundler 产出）
#
# 用法：
#   bash scripts/build-run.sh               # 完整构建 + 独立启动（后台 setsid）
#   bash scripts/build-run.sh --foreground  # 完整构建 + 前台运行（Ctrl+C 退出）
#   bash scripts/build-run.sh --no-run      # 只构建，不启动
#   bash scripts/build-run.sh --dist        # 构建并打包成安装包（产出 bundle/）
#   bash scripts/build-run.sh --dist --skip-sea   # 打包，但复用已有 main.cjs（不重编 kimi-code）
#   bash scripts/build-run.sh --skip-agent  # 跳过 kimi-code 构建（前端/Rust 调试用）
#   bash scripts/build-run.sh --no-typecheck # 跳过 svelte-check / cargo check（更快）
#   bash scripts/build-run.sh --clean       # 清空 target/release 后重编（诊断奇怪编译错误）
#   bash scripts/build-run.sh --build-packages  # 先 pnpm build:packages（上游 merge 后必须）
#   bash scripts/build-run.sh --log-level debug   # 诊断模式：daemon 写 debug 级日志
#   bash scripts/build-run.sh --debug-endpoints   # 挂载 /api/v1/debug/* 内省路由
#   bash scripts/build-run.sh --help
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
PKG="@moonshot-ai/kimi-desktop-tauri"
NO_RUN=0
FOREGROUND=0
DIST=0
SKIP_SEA=0
SKIP_AGENT=0
NO_TYPECHECK=0
CLEAN=0
BUILD_PACKAGES=0
# Daemon log level (fatal|error|warn|info|debug|trace|silent). Default `info`
# records turn processing / model calls / MCP connections to server.log so
# prompt failures are diagnosable. Override with --log-level when reproducing.
LOG_LEVEL="${KIMI_DESKTOP_LOG_LEVEL:-info}"
DEBUG_ENDPOINTS=0

usage() {
  cat <<'EOF'
用法：
  bash scripts/build-run.sh               # 完整构建 + 独立启动（后台 setsid）
  bash scripts/build-run.sh --foreground  # 完整构建 + 前台运行（Ctrl+C 退出）
  bash scripts/build-run.sh --no-run      # 只构建，不启动
  bash scripts/build-run.sh --dist        # 构建并打包成安装包（产出 bundle/）
  bash scripts/build-run.sh --dist --skip-sea   # 打包，但复用已有 main.cjs（不重编 kimi-code）
  bash scripts/build-run.sh --skip-agent  # 跳过 kimi-code 构建（前端/Rust 调试用）
  bash scripts/build-run.sh --no-typecheck # 跳过 svelte-check / cargo check（更快）
  bash scripts/build-run.sh --clean       # 清空 target/release 后重编（诊断奇怪编译错误）
  bash scripts/build-run.sh --build-packages  # 先 pnpm build:packages（上游 merge 后必须）
  bash scripts/build-run.sh --log-level debug   # 诊断模式：daemon 写 debug 级日志
  bash scripts/build-run.sh --debug-endpoints   # 挂载 /api/v1/debug/* 内省路由
  bash scripts/build-run.sh --help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift; break ;;
    --no-run) NO_RUN=1; shift ;;
    --foreground) FOREGROUND=1; shift ;;
    --dist) DIST=1; shift ;;
    --skip-sea) SKIP_SEA=1; shift ;;
    --skip-agent) SKIP_AGENT=1; shift ;;
    --no-typecheck) NO_TYPECHECK=1; shift ;;
    --clean) CLEAN=1; shift ;;
    --build-packages) BUILD_PACKAGES=1; shift ;;
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
# --skip-sea 与 --skip-agent 互斥（前者要求已有 main.cjs，后者根本不构建）
if [[ "$SKIP_SEA" == "1" && "$SKIP_AGENT" == "1" ]]; then
  echo "error: --skip-sea and --skip-agent are mutually exclusive" >&2
  exit 2
fi

command -v pnpm >/dev/null 2>&1 || { echo "error: pnpm is required" >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "error: cargo is required" >&2; exit 1; }
command -v node  >/dev/null 2>&1 || { echo "error: node is required" >&2; exit 1; }

# Node 版本检查（kimi-code 要求 >= 24.15）
NODE_VERSION=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [[ "$NODE_VERSION" -lt 24 ]]; then
  printf '\033[1;33m⚠ Node %s 检测到，kimi-code 要求 >= 24.15。可用 fnm/mise/nvm 切换：\033[0m\n' "$NODE_VERSION" >&2
  printf '    fnm use 24.15.0  ||  mise use node@24.15.0  ||  nvm use 24.15.0\n' >&2
fi

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

# ---- 0. 可选：构建 packages/（上游 merge 后必须，否则 main.cjs 引用旧 dist） ----
if [[ "$BUILD_PACKAGES" == "1" ]]; then
  log "构建 packages/（pnpm build:packages）…"
  pnpm run build:packages
  log "packages/ 构建完成"
fi

# ---- 1. 构建内嵌 agent（tsdown 产出 main.cjs，跳过 SEA 注入） ----
# 新架构：不再用 SEA（postject 注入 Node 二进制），而是直接用 tsdown 打包
# kimi-code 源码为 main.cjs，运行时用 Node 执行。这样：
#   - 更新 kimi-code 只需 tsdown（~30 秒），不用重新注入 SEA（5-10 分钟）
#   - 跳过 sea-config / blob / postject / sign 整个链路
#   - 调试迭代速度提升 10 倍
AGENT_SCRIPT="$REPO_ROOT/apps/kimi-code/dist-native/intermediates/main.cjs"

if [[ "$SKIP_AGENT" == "1" ]]; then
  if [[ ! -f "$AGENT_SCRIPT" ]]; then
    err "main.cjs not found at $AGENT_SCRIPT (--skip-agent requires an existing build)"
    err "请先不带 --skip-agent 跑一次完整构建"
    exit 1
  fi
  log "跳过 kimi-code 构建（--skip-agent），复用: $AGENT_SCRIPT"
elif [[ "$SKIP_SEA" == "1" ]]; then
  if [[ ! -f "$AGENT_SCRIPT" ]]; then
    err "main.cjs not found at $AGENT_SCRIPT (--skip-sea requires an existing build)"
    exit 1
  fi
  log "复用已有 main.cjs（--skip-sea）: $AGENT_SCRIPT"
else
  # 本分支已移除 apps/kimi-web（Tauri-only 方向）：daemon 仅提供 REST/WS，
  # 没有浏览器 UI 资源需要构建/拷贝。
  log "构建内嵌 agent（tsdown，约 30 秒）…"
  # 只跑 bundle 步骤（tsdown native config），跳过 SEA 注入步骤。
  # 先构建 vis asset（native 构建的前置依赖），再 tsdown。
  BUILD_VIS="$REPO_ROOT/apps/kimi-code/scripts/build-vis-asset.mjs"
  [[ -f "$BUILD_VIS" ]] && node "$BUILD_VIS" || true
  # 优先用仓库内 tsdown CLI（避免每次 npx 触发 pnpm 重新解析）
  TSDOWN_CLI=$(node -e "console.log(require.resolve('tsdown/run'))" 2>/dev/null || echo "")
  if [[ -z "$TSDOWN_CLI" ]]; then
    # fallback: 用 pnpm 在 kimi-code 目录跑 tsdown
    ( cd "$REPO_ROOT/apps/kimi-code" && npx tsdown --config tsdown.native.config.ts )
  else
    ( cd "$REPO_ROOT/apps/kimi-code" && node "$TSDOWN_CLI" --config tsdown.native.config.ts )
  fi

  if [[ ! -f "$AGENT_SCRIPT" ]]; then
    err "tsdown finished but main.cjs not found at $AGENT_SCRIPT"
    exit 1
  fi
  log "内嵌 agent: $AGENT_SCRIPT ($(du -h "$AGENT_SCRIPT" | cut -f1))"
fi

# ---- 1b. --clean：清空 target/release，避免增量编译的诡异错误 ----
if [[ "$CLEAN" == "1" ]]; then
  log "清空 target/release（--clean）…"
  cargo clean --release --manifest-path "$APP_DIR/src-tauri/Cargo.toml"
fi

# ---- 2. 前端 + Rust 检查（可跳过）----
if [[ "$NO_TYPECHECK" == "1" ]]; then
  warn "跳过 svelte-check / cargo check（--no-typecheck）"
else
  log "检查前端类型（svelte-check）…"
  pnpm --filter "$PKG" run typecheck

  # ---- 3. Rust 完整检查 ----
  log "检查客户端 Rust 代码（cargo check）…"
  cargo check --manifest-path "$APP_DIR/src-tauri/Cargo.toml" --no-default-features
fi

# =====================================================================
# 路径 A：打包模式（--dist）—— 走 Tauri bundler，产出安装包
# =====================================================================
if [[ "$DIST" == "1" ]]; then
  # Tauri 构建链会自动触发：
  #   beforeBuildCommand   = pnpm build            （Svelte 前端 → dist/）
  #   beforeBundleCommand  = node before-bundle.cjs （stage main.cjs + Node → resources/bin/）
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

# ---- 6. dev 模式无需 staging ----
# 新架构：dev 模式下 release 二进制通过 sea_path.rs 的 dev 路径直接找
# apps/kimi-code/dist-native/intermediates/main.cjs，不需要复制到 resources/。
# 打包时（--dist）由 before-bundle.cjs 负责把 main.cjs 复制到 src-tauri/resources/。
log "agent 已就绪（dev 直接引用）: $AGENT_SCRIPT"

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

# 任务栏身份（Wayland/KDE）：窗口的 xdg app_id 来自 bundle identifier
#（tauri.conf.json 的 enableGTKAppId），KWin 按 <app_id>.desktop 匹配任务栏
# 条目。开发期没有安装包落地 desktop 文件，这里幂等播种一个用户级条目，
# 让本应用在自己的任务栏图标下显示，而不是堆叠进宿主（如 ZCode）的分组。
DESKTOP_ID="ai.moonshot.kimi.desktop.tauri"
APPS_DIR="$HOME/.local/share/applications"
if [[ -d "$APPS_DIR" ]]; then
  cat > "$APPS_DIR/$DESKTOP_ID.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Kimi Code Desktop
Comment=Kimi Code desktop client (Tauri)
Exec=$BIN
Icon=$APP_DIR/src-tauri/icons/128x128.png
StartupWMClass=$DESKTOP_ID
Terminal=false
Categories=Development;
EOF
fi

# 清除会从启动器/宿主（如 ZCode AppImage）继承的环境标记，否则 KDE 会按
# CHROME_DESKTOP 把本窗口归到宿主的 .desktop 组里（任务栏与宿主混在一起）。
if [[ "$FOREGROUND" == "1" ]]; then
  log "前台启动客户端（Ctrl+C 退出）…"
  exec env -u CHROME_DESKTOP -u APPIMAGE -u APPDIR \
      KIMI_DESKTOP_DEV=1 \
      KIMI_DESKTOP_LOG_LEVEL="$LOG_LEVEL" \
      KIMI_DESKTOP_DEBUG_ENDPOINTS="$DEBUG_FLAG" \
      "$BIN"
fi

setsid -f env -u CHROME_DESKTOP -u APPIMAGE -u APPDIR \
    KIMI_DESKTOP_DEV=1 \
    KIMI_DESKTOP_LOG_LEVEL="$LOG_LEVEL" \
    KIMI_DESKTOP_DEBUG_ENDPOINTS="$DEBUG_FLAG" \
    "$BIN" >"$LOG" 2>&1 < /dev/null
sleep 2
CLIENT_PID="$(pgrep -f "release/kimi-desktop-tauri" | head -1 || true)"
log "客户端已作为独立进程启动（pid: ${CLIENT_PID:-unknown}，ppid=init，不随本脚本/启动器退出）"
log "日志: $LOG · 停止: kill ${CLIENT_PID:-<pid>}"
