#!/usr/bin/env bash
# stage-codegraph.sh — 把 codegraph CLI 精简打包到 Tauri resources 目录。
#
# codegraph（https://github.com/colbymchenry/codegraph）是一个 Node.js
# 应用，安装目录约 184MB（含 Node runtime 118MB + node_modules 57MB）。
# 但核心代码只有 ~31MB：
#   lib/dist/          9.8MB  编译后的 JS + SQL schema + 4 个额外 wasm
#   核心依赖            ~7MB   chokidar/commander/ignore/jsonc-parser/picomatch/web-tree-sitter
#   14 种核心语言 wasm  ~14MB   js/ts/py/rs/go/java/cpp/c/css/html/json/bash/ruby/scala
#
# Node runtime 不需要复制——项目已有 Node（apps/kimi-code/dist-native/ 或 Tauri resource node）。
# 非 14 种核心语言的 wasm 不复制（ocaml/elm/solidity 等小众语言按需可后续补充）。
#
# 产出目录结构：
#   src-tauri/resources/codegraph/
#     bin/codegraph           启动脚本（用项目 node 跑 codegraph.js）
#     lib/dist/               编译后的 JS + wasm + SQL
#     lib/node_modules/       精简后的依赖
#     lib/package.json
#
# 用法：
#   bash scripts/stage-codegraph.sh          # 从系统 codegraph 安装 stage
#   bash scripts/stage-codegraph.sh --check  # 只检查，不复制
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$APP_DIR/src-tauri/resources/codegraph"

# 找系统 codegraph 安装目录
CODEGRAPH_BIN="$(command -v codegraph 2>/dev/null || true)"
if [[ -z "$CODEGRAPH_BIN" ]]; then
  echo "error: codegraph not found on PATH. Install it first:" >&2
  echo "  curl -fsSL https://codegraph.dev/install.sh | bash" >&2
  exit 1
fi

# Resolve symlink to find the version dir
SELF="$CODEGRAPH_BIN"
while [ -L "$SELF" ]; do
  target="$(readlink "$SELF")"
  case "$target" in
    /*) SELF="$target" ;;
    *) SELF="$(dirname "$SELF")/$target" ;;
  esac
done
CG_ROOT="$(cd "$(dirname "$SELF")/.." && pwd)"

echo "codegraph source: $CG_ROOT"
echo "destination:      $DEST"

if [[ "${1:-}" == "--check" ]]; then
  echo "--check mode: not copying"
  echo "  dist size: $(du -sh "$CG_ROOT/lib/dist/" | cut -f1)"
  echo "  node_modules size: $(du -sh "$CG_ROOT/lib/node_modules/" | cut -f1)"
  exit 0
fi

# Clean destination
rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/lib"

# 1. Copy dist/ (compiled JS + SQL + WASM)
echo "▸ copying lib/dist/..."
cp -r "$CG_ROOT/lib/dist" "$DEST/lib/dist"
cp "$CG_ROOT/lib/package.json" "$DEST/lib/package.json"

# 2. Copy only needed node_modules
echo "▸ copying node_modules (pruned)..."
mkdir -p "$DEST/lib/node_modules"
for pkg in chokidar commander ignore jsonc-parser picomatch web-tree-sitter; do
  if [ -d "$CG_ROOT/lib/node_modules/$pkg" ]; then
    cp -r "$CG_ROOT/lib/node_modules/$pkg" "$DEST/lib/node_modules/$pkg"
  fi
done

# 3. Copy tree-sitter-wasms (only core 14 languages — saves ~36MB)
echo "▸ copying tree-sitter-wasms (14 core languages)..."
WASM_SRC="$CG_ROOT/lib/node_modules/tree-sitter-wasms/out"
WASM_DST="$DEST/lib/node_modules/tree-sitter-wasms/out"
mkdir -p "$WASM_DST"
# Copy package metadata so 'require' can resolve the package
cp "$CG_ROOT/lib/node_modules/tree-sitter-wasms/package.json" \
   "$DEST/lib/node_modules/tree-sitter-wasms/package.json" 2>/dev/null || true
for lang in javascript typescript python rust go java cpp c css html json bash ruby scala; do
  # tree-sitter uses c_sharp not csharp, and bash not shell
  for f in "tree-sitter-${lang}.wasm" "tree-sitter-${lang//cpp/cpp}.wasm"; do
    if [ -f "$WASM_SRC/$f" ]; then
      cp "$WASM_SRC/$f" "$WASM_DST/$f"
    fi
  done
done
# Also copy the special naming variants
for f in tree-sitter-c_sharp.wasm; do
  [ -f "$WASM_SRC/$f" ] && cp "$WASM_SRC/$f" "$WASM_DST/$f"
done

# 4. Create launcher script that uses the project's Node runtime
echo "▸ creating launcher script..."
cat > "$DEST/bin/codegraph" <<'LAUNCHER'
#!/bin/sh
# codegraph launcher — uses the project's Node runtime (bundled with the
# Tauri app) instead of requiring a system Node installation.
#
# The Tauri app resolves Node via sea_path.rs (dev: system node on PATH,
# packaged: <resource_dir>/node). This launcher mirrors that logic so
# codegraph works in both dev and packaged modes.

SELF="$0"
DIR="$(cd "$(dirname "$SELF")/.." && pwd)"

# Try the Node binary that ships alongside this app in resources/
if [ -x "$DIR/../node" ]; then
  exec "$DIR/../node" --liftoff-only "$DIR/lib/dist/bin/codegraph.js" "$@"
fi

# Dev mode fallback: system node on PATH
if command -v node >/dev/null 2>&1; then
  exec node --liftoff-only "$DIR/lib/dist/bin/codegraph.js" "$@"
fi

echo "error: Node.js runtime not found. Expected at $DIR/../node or on PATH." >&2
exit 1
LAUNCHER
chmod +x "$DEST/bin/codegraph"

echo ""
echo "✓ codegraph staged to $DEST"
echo "  total size: $(du -sh "$DEST" | cut -f1)"
echo "  dist:       $(du -sh "$DEST/lib/dist" | cut -f1)"
echo "  node_modules: $(du -sh "$DEST/lib/node_modules" | cut -f1)"
