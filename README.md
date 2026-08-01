# Partial Lunar Eclipse · 月偏食

> A native desktop workspace for [Kimi Code](https://github.com/MoonshotAI/kimi-code), shaped by a partial lunar eclipse.
> 基于 [Kimi Code](https://github.com/MoonshotAI/kimi-code) 衍生的原生桌面工作区——月偏食：Kimi 的蓝紫月光穿过偏食边缘，落到本地工作台。

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Site](https://img.shields.io/badge/site-github%20pages-786fff)](https://d2rabbit.github.io/kimi-code/) [![Desktop](https://img.shields.io/badge/desktop-Tauri%202-e79a70)](apps/kimi-desktop-tauri) <br>
[官网](https://d2rabbit.github.io/kimi-code/) · [下载](https://github.com/d2rabbit/kimi-code/releases) · [Issues](https://github.com/d2rabbit/kimi-code/issues) · [原始项目 · Upstream](https://github.com/MoonshotAI/kimi-code)

## 是什么 · What is this

**Partial Lunar Eclipse（月偏食）** 是 Kimi Code 的 Tauri 桌面客户端仓库，从上游 [Kimi Code](https://github.com/MoonshotAI/kimi-code)（Moonshot AI 的终端 AI 编码代理）衍生而来：保留同一套 agent 引擎、会话、工具链与协议能力，再为它构建独立的原生桌面工作台。

名字的含义：**月，是 Kimi / Moonshot；偏食，是衍生而不遮蔽**——我们跟踪上游主干，同时沉淀自己的桌面体验。

### 桌面能力

- **工作区与检索**：Workspace 分组、跨会话消息搜索、工作区文件提及与文件定位
- **会话与工具**：双列对话、类型化工具卡、审批与提问、流式终端、MCP 和插件命令
- **模型与账号**：主模型 / 辅助模型配置、Kimi 托管账号信息、结构化配额与 Booster 用量
- **原生运行边界**：私有内嵌 daemon、隔离 home、随机回环端口、自包含 Node runtime、受限 Tauri 权限
- **桌面体验**：七套主题、克制动效、诊断包导出、后台恢复与本机身份适配

### 与主干的关系

本仓库持续同步上游 `main`，但不会机械复制所有 Web 或 CLI 表面：agent 引擎、协议、模型、会话、工具、插件与 SDK 等通用能力会随主干迁移；适合原生桌面的交互能力会在 Tauri 中重新设计；浏览器专属页面与 Electron 包装层则不进入当前产品路线。

## 构建 · Build

需要 Node ≥ 24.15、pnpm 10.33 与 Rust 工具链。

```sh
git clone https://github.com/d2rabbit/kimi-code.git
cd kimi-code
pnpm install

# 快速开发（构建内嵌 agent，并启动 Tauri）
pnpm desktop:dev

# 构建后直接运行桌面客户端
pnpm desktop:run

# 产出可执行程序（本地调试版）
pnpm desktop:build

# 产出安装包（.deb/.rpm/.AppImage/.dmg/.msi）
bash apps/kimi-desktop-tauri/scripts/build-run.sh --dist
```

完整的 Tauri 热更新开发仍可运行 `pnpm --filter @moonshot-ai/kimi-desktop-tauri run tauri:dev`。GitHub Actions 已配置多平台打包（`desktop-v*` 标签触发，产物挂到 Release）。

## 仓库结构 · Layout

```
apps/
  kimi-code            # 内嵌 agent 本体（CLI/daemon，上游主干 + fork 增量）
  kimi-desktop-tauri   # Tauri 桌面客户端（Svelte 5 前端 + Rust 外壳）
packages/              # agent 引擎与协议包（上游主干）
```

与上游的主要差异：移除了 `apps/kimi-web`（浏览器版，daemon 改为可选挂载、无资产时仅提供 REST/WS）与 Electron 包装版；daemon 的浏览器 UI 变为可选——没有 `dist-web` 时照常以 API-only 模式启动。

Fork 层面的版本记录见 [CHANGELOG.md](CHANGELOG.md)；各上游 package 的发布历史仍保留在对应目录的 `CHANGELOG.md` 中。

## 原始项目 · Upstream

本仓库是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 fork，持续合并上游 main。引擎、协议与 CLI 能力全部来自上游，致谢 Moonshot AI 团队。

- 上游文档：<https://moonshotai.github.io/kimi-code/en/>
- 本 fork 站点：<https://d2rabbit.github.io/kimi-code/>

## License

[MIT](LICENSE)（与上游一致）
