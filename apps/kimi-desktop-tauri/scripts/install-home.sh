#!/usr/bin/env bash
# install-home.sh — 构建 Partial Lunar Eclipse 桌面端并安装到当前用户 home。
#
# 安装布局（与既有安装一致）：
#   ~/.local/opt/partial-lunar-eclipse/usr/bin/kimi-desktop-tauri   主程序
#   ~/.local/opt/partial-lunar-eclipse/usr/lib/Partial Lunar Eclipse/{main.cjs,node,node-LICENSE,codegraph/}
#   ~/.local/share/applications/Partial Lunar Eclipse.desktop       桌面入口
#   ~/.local/share/icons/hicolor/{32x32,64x64,128x128,256x256@2}/apps/kimi-desktop-tauri.png
#
# 运行中的旧实例不会被直接覆盖：所有文件都先写临时文件再 mv 原子替换
# （直接 cp 覆盖正在执行的二进制会报 "文本文件忙"）。重启应用后生效。
#
# 用法：bash scripts/install-home.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
PREFIX="$HOME/.local/opt/partial-lunar-eclipse"
BIN_DIR="$PREFIX/usr/bin"
LIB_DIR="$PREFIX/usr/lib/Partial Lunar Eclipse"
APPS_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor"

step() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

# 原子替换：先复制到同目录临时文件，再 mv（正在执行的文件也能换名）。
install_atomic() { # src dst mode
  local src="$1" dst="$2" mode="$3" tmp
  tmp="$(dirname "$dst")/.install-tmp.$(basename "$dst").$$"
  cp -f "$src" "$tmp"
  chmod "$mode" "$tmp"
  mv -f "$tmp" "$dst"
}

command -v pnpm >/dev/null || { echo '需要 pnpm'; exit 1; }
command -v cargo >/dev/null || { echo '需要 Rust 工具链（cargo）'; exit 1; }

# ---- 1. 前端构建（vite → dist/） ----
step '构建前端（vite build）'
pnpm --dir "$APP_DIR" run build

# ---- 2. 刷新 agent sidecar 资源（main.cjs + node runtime） ----
# main.cjs 是 kimi-code agent 的预构建产物，只有 agent 代码变更才需要重打。
if [ -f "$REPO_ROOT/apps/kimi-code/dist-native/intermediates/main.cjs" ]; then
  step '刷新 agent sidecar 资源（before-bundle.cjs）'
  node "$APP_DIR/scripts/before-bundle.cjs"
else
  warn '未找到 apps/kimi-code/dist-native 预构建产物，复用现有 src-tauri/resources/bin（agent 未更新时这是正常的）'
fi

# ---- 3. Rust 构建 ----
step '构建 Tauri 主程序（cargo build --release）'
cargo build --release --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

# ---- 4. 安装主程序与 sidecar 资源 ----
step "安装到 $PREFIX"
mkdir -p "$BIN_DIR" "$LIB_DIR"
install_atomic "$APP_DIR/src-tauri/target/release/kimi-desktop-tauri" "$BIN_DIR/kimi-desktop-tauri" 755

for f in main.cjs node node-LICENSE; do
  src="$APP_DIR/src-tauri/resources/bin/$f"
  [ -f "$src" ] && install_atomic "$src" "$LIB_DIR/$f" 755
done

if [ -d "$APP_DIR/src-tauri/resources/codegraph" ] && [ -n "$(ls -A "$APP_DIR/src-tauri/resources/codegraph" 2>/dev/null)" ]; then
  mkdir -p "$LIB_DIR/codegraph"
  cp -a "$APP_DIR/src-tauri/resources/codegraph/." "$LIB_DIR/codegraph/"
fi

# ---- 5. 桌面入口与图标 ----
step '安装桌面入口与图标'
mkdir -p "$APPS_DIR" \
  "$ICON_DIR/32x32/apps" "$ICON_DIR/64x64/apps" "$ICON_DIR/128x128/apps" "$ICON_DIR/256x256@2/apps"

cat > "$APPS_DIR/Partial Lunar Eclipse.desktop" <<EOF
[Desktop Entry]
Categories=Development;
Comment=Partial Lunar Eclipse desktop client (Tauri)
Exec=$BIN_DIR/kimi-desktop-tauri
StartupWMClass=kimi-desktop-tauri
Icon=kimi-desktop-tauri
Name=Partial Lunar Eclipse
Terminal=false
Type=Application
EOF

cp -f "$APP_DIR/src-tauri/icons/32x32.png" "$ICON_DIR/32x32/apps/kimi-desktop-tauri.png"
cp -f "$APP_DIR/src-tauri/icons/64x64.png" "$ICON_DIR/64x64/apps/kimi-desktop-tauri.png"
cp -f "$APP_DIR/src-tauri/icons/128x128.png" "$ICON_DIR/128x128/apps/kimi-desktop-tauri.png"
cp -f "$APP_DIR/src-tauri/icons/128x128@2x.png" "$ICON_DIR/256x256@2/apps/kimi-desktop-tauri.png"
update-desktop-database "$APPS_DIR" 2>/dev/null || true

step '完成。正在运行的旧实例仍是旧代码，退出应用重新打开后生效。'
