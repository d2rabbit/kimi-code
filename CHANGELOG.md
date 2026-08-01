# Changelog

这里记录 Partial Lunar Eclipse fork 的桌面产品、上游适配与官网变化。上游 CLI、SDK 和各 package 的发布记录仍以对应目录中的 `CHANGELOG.md` 为准。

## 2026-07-31

### Added

- 为 Tauri 桌面端加入跨会话消息搜索、Workspace 范围文件提及和文件定位能力。
- 加入主模型 / 辅助模型配置、Kimi 托管账号资料、结构化配额与 Booster 用量展示。
- 加入交互式流式终端、桌面专属 host identity、自包含 Node runtime 和内嵌 agent 恢复机制。
- 重做 GitHub Pages 官网，以 Kimi 蓝紫光源与月偏食铜色边缘建立统一品牌视觉，并加入偏食阶段、轨道、光束、星野、视差和滚动入场动画。

### Changed

- 同步上游 `main` 的 agent、会话、模型目录、工具、插件、协议和 CLI/SDK 增强，并按照原生桌面边界迁移到 Tauri 客户端。
- Release 构建不再包含 MCP 调试工具，并进一步收紧 Tauri 原生权限范围。
- 调整桌面动效密度与恢复流程，在保留反馈感的同时支持 `prefers-reduced-motion`。
- README 更新为当前单一 Tauri 产品路线、桌面能力和主干同步策略。

### Fixed

- 公共模型目录不可访问时回退到内置快照，避免第三方 Provider 导入流程被网络环境阻断。
- 修复小屏官网首屏的横向溢出，以及 reduced-motion 模式下 Canvas 星野仍持续刷新的问题。
