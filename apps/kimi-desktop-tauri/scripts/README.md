# kimi-desktop-tauri 构建脚本

本目录包含构建和运行 Kimi Code Desktop (Tauri) 的脚本。根据你的平台选择对应脚本。

## 前置检查（仅 Windows，首次运行）

```powershell
# 在 PowerShell 里运行（无需管理员权限）
.\scripts\check-prereqs.ps1
```

检查 Node.js / pnpm / Rust / WebView2 / MSVC C++ Build Tools 是否就绪。全部通过后才可继续。

## 快速启动（测试人员推荐）

零参数，前台运行，daemon 写 info 级日志便于诊断：

**Linux / macOS：**
```bash
bash scripts/dev-quick.sh
# 或从仓库根目录
pnpm desktop:dev
```

**Windows (PowerShell)：**
```powershell
.\scripts\dev-quick.ps1
# 首次启动若报执行策略错误，先执行（当前用户一次性放行）：
# Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 完整构建脚本

### `build-run.sh` (Linux / macOS) 与 `build-run.ps1` (Windows)

两个脚本是功能对等的，参数名按平台惯例（bash 用 `--flag`，PowerShell 用 `-Flag`）。

| 用途 | Linux / macOS | Windows |
|---|---|---|
| 构建 + 后台启动 | `bash scripts/build-run.sh` | `.\scripts\build-run.ps1` |
| 构建 + 前台运行 | `bash scripts/build-run.sh --foreground` | `.\scripts\build-run.ps1 -Foreground` |
| 只构建不启动 | `bash scripts/build-run.sh --no-run` | `.\scripts\build-run.ps1 -NoRun` |
| 打包安装包 | `bash scripts/build-run.sh --dist` | `.\scripts\build-run.ps1 -Dist` |
| 跳过 agent 构建 | `bash scripts/build-run.sh --skip-agent` | `.\scripts\build-run.ps1 -SkipAgent` |
| 跳过类型检查 | `bash scripts/build-run.sh --no-typecheck` | `.\scripts\build-run.ps1 -NoTypecheck` |
| 清空 release 重编 | `bash scripts/build-run.sh --clean` | `.\scripts\build-run.ps1 -Clean` |
| 先构建 packages/ | `bash scripts/build-run.sh --build-packages` | `.\scripts\build-run.ps1 -BuildPackages` |
| 诊断模式（debug 日志） | `bash scripts/build-run.sh --foreground --log-level debug` | `.\scripts\build-run.ps1 -Foreground -LogLevel debug` |
| 启用 debug 端点 | `bash scripts/build-run.sh --debug-endpoints` | `.\scripts\build-run.ps1 -DebugEndpoints` |
| 帮助 | `bash scripts/build-run.sh --help` | `Get-Help .\scripts\build-run.ps1` |

### 上游 merge 后首次构建

从 `github/main` 合并了上游更新后，`packages/` 源码可能变更，需要先重建：

```bash
bash scripts/build-run.sh --build-packages --foreground
```

## 诊断

当 prompt 没有响应时，检查 daemon 日志（embedded agent 写入）：

- **Linux / macOS**：`~/.kimi-code/desktop/server/server.log`
- **Windows**：`%USERPROFILE%\.kimi-code\desktop\server\server.log`

查看 `turn.started` 之后的内容 —— 如果之后是空白，说明 agent 主循环在模型调用阶段卡住（常见原因：provider API key 失效或模型服务端故障）。

## 构建链路

脚本执行的完整步骤：

0. **（可选）构建 packages/**（`--build-packages`）：上游 merge 后必须，否则 main.cjs 引用旧 dist
1. **构建内嵌 agent**（除非 `--skip-agent`）：tsdown 打包 kimi-code → `dist-native/intermediates/main.cjs`（约 30 秒）。本分支为 Tauri-only 方向，没有浏览器 UI 资源需要构建，daemon 仅提供 REST/WS
2. **前端检查 + 构建**：`svelte-check` + `vite build`
3. **Rust 检查 + 构建**：`cargo check` + `cargo build --release --features custom-protocol`
4. **agent 就绪**：dev 模式直接引用 `main.cjs`；打包模式由 `before-bundle.cjs` 将 `main.cjs` 和 Node 运行时拷贝到 `resources/bin/`
5. **启动**：前台运行或后台独立进程

## 产物位置

- **release 二进制**：`src-tauri/target/release/kimi-desktop-tauri[.exe]`
- **内嵌 agent**：`apps/kimi-code/dist-native/intermediates/main.cjs`
- **安装包**（`--dist`）：`src-tauri/target/release/bundle/`
  - Linux：`.deb` / `.rpm` / `.AppImage`
  - macOS：`.dmg`
  - Windows：`.msi`
