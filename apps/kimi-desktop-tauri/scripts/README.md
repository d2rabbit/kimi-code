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

### `build-run.sh` (Linux / macOS / Git Bash) 与 `build-run.ps1` (Windows)

两个脚本是功能对等的，参数名按平台惯例（bash 用 `--flag`，PowerShell 用 `-Flag`）。

| 用途 | Linux / macOS | Windows |
|---|---|---|
| 构建 + 后台启动 | `bash scripts/build-run.sh` | `.\scripts\build-run.ps1` |
| 构建 + 前台运行 | `bash scripts/build-run.sh --foreground` | `.\scripts\build-run.ps1 -Foreground` |
| 只构建不启动 | `bash scripts/build-run.sh --no-run` | `.\scripts\build-run.ps1 -NoRun` |
| 打包安装包 | `bash scripts/build-run.sh --dist` | `.\scripts\build-run.ps1 -Dist` |
| 打包（复用 SEA） | `bash scripts/build-run.sh --dist --skip-sea` | `.\scripts\build-run.ps1 -Dist -SkipSea` |
| 诊断模式（debug 日志） | `bash scripts/build-run.sh --foreground --log-level debug` | `.\scripts\build-run.ps1 -Foreground -LogLevel debug` |
| 启用 debug 端点 | `bash scripts/build-run.sh --debug-endpoints` | `.\scripts\build-run.ps1 -DebugEndpoints` |
| 帮助 | `bash scripts/build-run.sh --help` | `Get-Help .\scripts\build-run.ps1` |

## 诊断

当 prompt 没有响应时，检查 daemon 日志（embedded agent 写入）：

- **Linux / macOS**：`~/.kimi-code/desktop/server/server.log`
- **Windows**：`%USERPROFILE%\.kimi-code\desktop\server\server.log`

查看 `turn.started` 之后的内容 —— 如果之后是空白，说明 agent 主循环在模型调用阶段卡住（常见原因：provider API key 失效或模型服务端故障）。

## 构建链路

脚本执行的完整步骤：

1. **构建 SEA**（除非 `--skip-sea` / `-SkipSea`）：
   - `pnpm --filter @moonshot-ai/kimi-web run build`（kimi-web 前端）
   - `node apps/kimi-code/scripts/copy-web-assets.mjs`（拷贝到 kimi-code/dist-web）
   - `pnpm --filter @moonshot-ai/kimi-code run build:native:sea`（打包 SEA）
2. **前端检查 + 构建**：`svelte-check` + `vite build`
3. **Rust 检查 + 构建**：`cargo check` + `cargo build --release --features custom-protocol`
4. **SEA staging**：把 SEA 拷到 `target/release/bin/<target>/`（dev）或 `src-tauri/resources/bin/<target>/`（dist）
5. **启动**：前台运行或后台独立进程

## 产物位置

- **release 二进制**：`src-tauri/target/release/kimi-desktop-tauri[.exe]`
- **安装包**（`--dist`）：`src-tauri/target/release/bundle/`
  - Linux：`.deb` / `.rpm` / `.AppImage`
  - macOS：`.dmg`
  - Windows：`.msi`
