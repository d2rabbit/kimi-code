# Partial Lunar Eclipse · 月偏食

> A desktop client for [Kimi Code](https://github.com/MoonshotAI/kimi-code), eclipsed onto the desktop.
> 基于 [Kimi Code](https://github.com/MoonshotAI/kimi-code) 衍生的桌面客户端——月偏食：月在（Kimi / Moonshot）之上，偏食成形。

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Site](https://img.shields.io/badge/site-github%20pages-blue)](https://d2rabbit.github.io/kimi-code/) <br>
[原始项目 · Upstream](https://github.com/MoonshotAI/kimi-code) · [站点](https://d2rabbit.github.io/kimi-code/) · [Issues](https://github.com/d2rabbit/kimi-code/issues)

## 是什么 · What is this

**Partial Lunar Eclipse（月偏食）** 是 Kimi Code 的 Tauri 桌面客户端仓库，从上游 [Kimi Code](https://github.com/MoonshotAI/kimi-code)（Moonshot AI 的终端 AI 编码代理）衍生而来：月亮（Kimi）依旧，只是换了一个被"偏食"过的形态——同一个 daemon、同一套会话与工具链，换上原生桌面外壳。

名字的含义：**月，是 Kimi / Moonshot；偏食，是衍生而不遮蔽**——我们跟踪上游主干，同时沉淀自己的桌面体验。

- **Tauri 2 + Svelte 5 + Rust**：与 Electron 平行的轻量桌面形态，本仓库已移除 `apps/kimi-web`（浏览器版）与 Electron 包装版，聚焦单一路线
- **QQ 式双列聊天**：用户/agent 分侧气泡，墨色融合的 markdown 渲染
- **类型化工具卡**：思考 / 工具 / MCP / JSON / 终端 / 审批 / 提问，各就其位，文件名与命令概略一目了然
- **插件市场**：服务端代理注册表 + 发现页 + 更新提醒
- **私有内嵌 daemon**：隔离 home、随机回环端口、随应用启停
- **诊断包导出**：一键打包会话与桌面日志
- **七套主题**：dark / light / clay / neon / glass / aqua / system

## 构建 · Build

需要 Node ≥ 24.15、pnpm 10.33 与 Rust 工具链。

```sh
git clone https://github.com/d2rabbit/kimi-code.git
cd kimi-code
pnpm install

# 开发运行（内嵌 daemon + 前端热更新）
pnpm --filter @moonshot-ai/kimi-desktop-tauri run tauri:dev

# 产出可执行程序（本地调试版）
bash apps/kimi-desktop-tauri/scripts/build-run.sh

# 产出安装包（.deb/.rpm/.AppImage/.dmg/.msi）
bash apps/kimi-desktop-tauri/scripts/build-run.sh --dist
```

GitHub Actions 已配置四平台打包（`desktop-v*` 标签触发，产物挂到 Release）。

## 仓库结构 · Layout

```
apps/
  kimi-code            # 内嵌 agent 本体（CLI/daemon，上游主干 + fork 增量）
  kimi-desktop-tauri   # Tauri 桌面客户端（Svelte 5 前端 + Rust 外壳）
packages/              # agent 引擎与协议包（上游主干）
```

与上游的主要差异：移除了 `apps/kimi-web`（浏览器版，daemon 改为可选挂载、无资产时仅提供 REST/WS）与 Electron 包装版；daemon 的浏览器 UI 变为可选——没有 `dist-web` 时照常以 API-only 模式启动。

## 原始项目 · Upstream

本仓库是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork，持续合并上游 main。引擎、协议与 CLI 能力全部来自上游，致谢 Moonshot AI 团队。

- 上游文档：<https://moonshotai.github.io/kimi-code/en/>
- 本 fork 站点：<https://d2rabbit.github.io/kimi-code/>

## License

[MIT](LICENSE)（与上游一致）
