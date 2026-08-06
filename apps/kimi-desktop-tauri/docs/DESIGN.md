# Partial Lunar Eclipse (Tauri) — 设计文档

> **状态**：设计中（MVP 阶段一进行中）
> **日期**：2026-07-10
> **位置**：`apps/kimi-desktop-tauri/`（与现有 Electron 版 `apps/kimi-desktop` 并存）
> **目的**：以 Tauri 2 + Svelte 5 重写一个更优雅的桌面端，MVP 功能与 kimi-web 对齐，布局针对桌面宽屏优化，并具备原生窗口打磨、动效微交互、桌面专属能力。本文档保留完整目的、范围、架构决策和实现进度，供后续接力。

---

## 1. 背景与动机

现有 `apps/kimi-desktop` 是 Electron 壳，打包 kimi-web 产物后由原生窗口承载。它工作正常，但：

- **重**：Electron 打包 Chromium + Node，产物大、内存高。
- **不够优雅**：直接套浏览器布局，未针对桌面宽屏和原生体验优化。
- **技术栈偏旧**：Electron 虽成熟，但与"克制"理念不符。

本设计用 **Tauri 2（Rust 内核 + 系统 WebView）+ Svelte 5（编译时响应式）** 重写，追求更小的产物、更低的内存、更优雅的桌面布局。**功能保持与 kimi-web 对齐**，不额外扩展。

## 2. 关键决策（已与用户确认）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 技术栈 | **Tauri 2 + Svelte 5 (Runes)** | 产物小（~5-10MB）、内存低；Svelte 编译时响应式、runtime ~10KB，与 Tauri 搭配最佳 |
| 前端加载 | **Tauri 重写前端**（不打包 kimi-web） | 全新实现更优雅，可针对桌面优化布局 |
| 逻辑复用 | **复制 kimi-web 逻辑，独立维护** | 两个 app 独立，不抽共享包，避免发版协调 |
| 后端 | **同一个 daemon**（REST + WS，端口 58627） | 与 CLI/浏览器/TUI 共享本地服务生态 |
| 新旧关系 | **并存**，新增独立 app，后续再定是否取代 Electron 版 | 降低风险 |
| 范围 | **MVP：kimi-web 有什么就做什么**，不额外扩展 | 聚焦对齐，控制工期 |

## 3. 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  Tauri 主进程 (Rust)                                      │
│    • ensure_daemon: spawn 内置 SEA `kimi server run`      │
│    • sidecar 管理、健康检查、读 lock                       │
│    • 原生能力: 托盘 / 全局快捷键 / 通知 / 剪贴板 / 菜单    │
│    • Tauri Commands → 前端 (Svelte)                       │
└───────────────┬──────────────────────────────────────────┘
                │ typed IPC (invoke / events)，仅用于原生能力
┌───────────────┴──────────────────────────────────────────┐
│  WebView: Svelte 5 (Runes) 前端                           │
│    • 组件: 重写，更优雅的桌面布局                          │
│    • stores: $state / $derived runes                      │
│    • API 层: 直接 HTTP + WS → daemon（复制自 kimi-web）    │
│    • i18n: svelte-i18n (en + zh，复制 kimi-web 词条)      │
└───────────────┬──────────────────────────────────────────┘
                │ REST + WebSocket (/api/v1)，同源
┌───────────────┴──────────────────────────────────────────┐
│  共享 daemon (端口 58627)                                 │
│    与 CLI / 浏览器 / TUI 共用同一个本地服务                 │
└──────────────────────────────────────────────────────────┘
```

### 通信分层原则

- **业务数据流（REST + WS）**：Svelte 前端直接连 daemon，复制 kimi-web 的 `api/daemon/` 层。不走 Tauri IPC 转发，避免 WS 流中转瓶颈。
- **原生能力（托盘/快捷键/通知/窗口）**：通过 Tauri Commands / Events，Rust 侧实现。
- **Daemon 启动**：Rust 侧 spawn SEA（翻译自现有 `ensure-server.ts`），前端通过 Tauri event 监听就绪/错误状态。

## 4. 目录结构

```
apps/kimi-desktop-tauri/
├── package.json                  # 前端构建脚本 + Tauri CLI
├── AGENTS.md                     # 本包开发指引
├── src/                          # Svelte 5 前端
│   ├── main.ts                   # bootstrap (mount App)
│   ├── app.html                  # HTML 模板
│   ├── App.svelte                # 根组件（布局编排）
│   ├── lib/
│   │   ├── api/                  # 复制自 kimi-web/api，适配 fetch/WS（无 Vite 代理）
│   │   │   ├── index.ts          # getKimiDesktopApi() 单例
│   │   │   ├── config.ts         # REST/WS URL 构建（同源到 daemon）
│   │   │   ├── types.ts          # 应用层类型（camelCase）
│   │   │   ├── errors.ts         # DaemonApiError / DaemonNetworkError
│   │   │   └── daemon/
│   │   │       ├── client.ts     # API 实现
│   │   │       ├── http.ts       # REST 传输层
│   │   │       ├── ws.ts         # WS 事件流
│   │   │       ├── wire.ts       # wire DTO + WS frame 类型
│   │   │       ├── mappers.ts    # wire ↔ app 转换
│   │   │       ├── serverAuth.ts # bearer token 管理
│   │   │       ├── eventReducer.ts      # 状态 reducer
│   │   │       └── agentEventProjector.ts # agent-core 帧投影
│   │   ├── stores/               # Svelte runes stores（对应 kimi-web composables）
│   │   │   ├── client.svelte.ts  # 核心 client（对应 useKimiWebClient）
│   │   │   ├── appearance.svelte.ts      # 主题/字体/accent
│   │   │   ├── workspace.svelte.ts      # workspace/session 逻辑
│   │   │   ├── modelProvider.svelte.ts  # 模型/provider
│   │   │   ├── sideChat.svelte.ts       # BTW 侧聊
│   │   │   ├── detailPanel.svelte.ts    # 右侧详情面板
│   │   │   ├── sidebar.svelte.ts        # 侧边栏布局
│   │   │   ├── composer.svelte.ts       # 输入框草稿/历史
│   │   │   └── notification.svelte.ts   # 通知/声音
│   │   ├── components/           # 重写的组件
│   │   │   ├── ui/               # 设计系统原语（复制 token，Svelte 重写）
│   │   │   ├── chat/             # 对话组件
│   │   │   ├── sidebar/          # 侧边栏组件
│   │   │   ├── settings/         # 设置组件
│   │   │   └── dialogs/          # 对话框
│   │   ├── i18n/                 # 复制 kimi-web 词条，svelte-i18n 适配
│   │   │   ├── index.ts
│   │   │   └── locales/{en,zh}/
│   │   ├── lib/                  # 复制 kimi-web/lib 纯工具函数
│   │   └── styles/               # 复制 design tokens (style.css)
│   └── routes/                   # （可选）SvelteKit 路由，或纯 SPA
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置（窗口/图标/打包/能力）
│   ├── build.rs
│   ├── icons/                    # 应用图标（复用 kimi-desktop/build/）
│   └── src/
│       ├── main.rs               # Tauri 入口
│       ├── daemon.rs             # ensure_daemon（翻译自 ensure-server.ts）
│       ├── sea_path.rs           # SEA 路径解析（翻译自 sea-path.ts）
│       └── commands.rs           # Tauri commands（原生能力）
├── scripts/
│   └── build-run.sh / build-run.ps1  # 一键构建 + 启动（Tauri-only：无浏览器 UI 资产步骤）
└── test/                         # 测试
```

## 5. MVP 功能范围（对齐 kimi-web）

**原则**：kimi-web 有什么就做什么，不额外扩展。

### 5.1 核心 API 层（复制，必须完整）
- REST：health/meta、sessions（CRUD/status/abort/compact/undo/fork/children/btw/snapshot/messages）、prompts（submit/steer/abort）、approvals/questions、tasks/terminals、skills、fs（list/read/search/grep/git_status/diff/open/reveal/download）、workspaces、models/providers、config、auth、files。
- WS：完整事件投影（session/message/assistant/tool/approval/question/task/config/model_catalog + agent-core 原始帧）。
- 同步协议 v2：snapshot → subscribe(cursor) → delta offset 对齐 → resync。

### 5.2 核心状态（Svelte runes 重写，对应 composables）
- **client store**（对应 useKimiWebClient）：sessions/turns/tasks/todos/goal/approvals/questions/queued/git/changes + 所有运行时控制（permission/thinking/planMode/swarmMode/goalMode）+ 外观（colorScheme/accent/fontSize）+ 通知设置。
- appearance / workspace / modelProvider / sideChat / detailPanel / sidebar / composer / notification 子 stores。

### 5.3 组件清单（重写，功能对齐）
**必须实现**（对应 kimi-web）：
- 布局：App 根、Sidebar（workspace 分组 + session 列表）、ConversationPane、右侧 Detail 面板（file/diff/thinking/compaction/agent/toolDiff/sideChat）。
- 对话：ChatHeader、ChatPane、Composer（slash/mention/history/附件）、Markdown（流式）、ToolCall/ToolGroup、ApprovalCard、QuestionCard、TodoCard、ThinkingBlock、GoalStrip、StatusGlyph。
- 工具渲染：Agent/Edit/Media/Swarm/AskUser/Generic + ToolOutputBlock。
- 设置：SettingsDialog、ModelPicker、Onboarding、LanguageSwitcher。
- 对话框：LoginDialog、AddWorkspaceDialog、ConfirmDialog、ServerAuthDialog。
- UI 原语：Button/IconButton/Icon/Badge/Pill/Card/Input/Select/Textarea/Field/Dialog/Spinner/MoonSpinner/Menu/SegmentedControl/Tabs/Switch/Checkbox/Avatar/EmptyState/Divider/Tooltip/Banner/Sheet/Skeleton/TopBar 等。
- 移动端适配可**暂缓**（桌面端优先，但保留 `isMobile` 判断的接缝）。

### 5.4 i18n
- 复制全部 30 个 namespace 的 en/zh 词条，适配 svelte-i18n。

### 5.5 Slash 命令
- 18 条内置命令 + skill 激活，全部实现。

### 5.6 设计 Token
- 复制完整 token 体系（颜色双套、间距 4px 网格、圆角 7 档、z-index 7 档、阴影、运动、字体、字号、字重、行高、特殊原语）。
- **主题契约（2026-07 起）**：在既有 token 之上叠加一层「主题契约」（`--g-*` 几何 / `--elev-*` elevation / `--mat-*` 材质 / `--motion-*` 动效 / `--type-*` 排版签名），每个主题块填满全量契约，UI 原语（`src/lib/components/ui/`，见 `docs/PRIMITIVES.md`）只消费契约 token。六种设计语言规范见 `docs/themes/`（aurora-tile / clay / neon / glass / aqua / moonshot）。

## 6. "更优雅"的布局设计（核心差异化）

### 6.1 宽屏布局重构
- **三列自适应栅格**：侧边栏（可折叠，256-320px）| 会话区（flex-1，max-width 900px 居中）| 详情面板（按需展开，420-640px）。
- 详情面板改为**覆盖式抽屉**而非挤压会话列（会话区宽度稳定，阅读体验更好）。
- 侧边栏折叠后变为**图标 rail**（workspace 图标 + 新建按钮），悬停展开浮层预览。

### 6.2 原生窗口打磨
- **macOS**：透明标题栏 + 红绿灯避让（复用 kimi-web 已有的 `trafficLightPosition` 逻辑），窗口圆角。
- **Windows/Linux**：自绘标题栏（可选），或使用系统标题栏但优化内容 padding。
- 窗口状态持久化（位置/大小/最大化），启动恢复。

### 6.3 动效与微交互
- 面板展开/折叠用 `interpolate-size: allow-keywords` + cubic-bezier 过渡。
- 会话切换：交叉淡入淡出。
- 主题切换：颜色过渡（`transition: background-color, color`）。
- hover/focus：统一的 token 化反馈（`--color-hover`、`--p-focus-ring`）。
- 月亮 spinner 保留（Kimi 品牌标识），其余 loading 用普通 spinner。
- `prefers-reduced-motion` 全量禁用动画。

### 6.4 桌面专属能力（通过 Tauri）
- **系统托盘**：最小化到托盘、托盘图标显示运行状态。
- **全局快捷键**：可配置快捷键唤起窗口（如 Cmd/Ctrl+Shift+K）。
- **原生通知**：任务完成/提问/审批通知走系统通知中心（替代浏览器 Notification）。
- **Dock/任务栏角标**：未读会话数角标。
- **原生菜单**：文件/编辑/视图/窗口菜单，含"重试连接""打开日志"等。

## 7. Rust 后端设计

### 7.1 daemon.rs（翻译自 ensure-server.ts）
```
ensure_daemon(sea_path) -> Result<Origin>
  1. spawn SEA: `kimi server run --log-level error`（超时 30s）
  2. read lock: ~/.kimi-code/server/lock（pid/host/port）
  3. poll /api/v1/healthz（200ms 间隔，超时 20s）
  4. 返回 origin（如 http://127.0.0.1:58627）
```

### 7.2 sea_path.rs（翻译自 sea-path.ts）
- 打包后：`<resources>/bin/<platform>-<arch>/kimi[.exe]`
- 开发时：`apps/kimi-code/dist-native/bin/<target>/kimi[.exe]`
- 支持 6 目标：darwin-arm64/x64、linux-arm64/x64、win32-arm64/x64。

### 7.3 commands.rs（Tauri commands）
- `ensure_server()` → 启动 daemon，返回 origin 或错误。
- `read_server_token()` → 读取 `~/.kimi-code/server.token`。
- `get_server_log_path()` → 返回日志路径。
- `open_path(path)` → 系统默认程序打开。
- 托盘/快捷键/通知/Dock 角标在 main.rs 用 Tauri 插件注册。

### 7.4 Tauri 配置要点
- `tauri.conf.json`：窗口（1280x860，min 720x480）、标题 "Partial Lunar Eclipse"、图标、打包目标（macOS dmg+app、Windows nsis、Linux AppImage+deb）。
- 能力（capabilities）：允许前端调用 ensure_server/open_path 等 command；HTTP/WS 由 WebView 直连（需 `http` 插件或 CSP 放行 127.0.0.1）。
- 打包前同样需要 stage SEA（类似 before-pack.cjs），用 `beforeBundleCommand` 脚本。

## 8. 分阶段实现计划

### 阶段一：脚手架 + Rust daemon（当前进度）
- [ ] 创建 `apps/kimi-desktop-tauri/` 目录结构
- [ ] `src-tauri/`：Cargo.toml、tauri.conf.json、main.rs
- [ ] daemon.rs：ensure_daemon（spawn SEA + 读 lock + 健康检查）
- [ ] sea_path.rs：SEA 路径解析
- [ ] commands.rs：ensure_server / read_server_token / open_path
- [ ] 前端：最小 Svelte app，调用 ensure_server，加载 daemon URL，显示连接状态
- [ ] 验证：能启动 daemon 并在窗口中显示 kimi-web（先用 iframe/loadURL 验证链路，后续替换为重写前端）

### 阶段二：前端骨架 + API 层
- [ ] 复制 kimi-web `src/api/` 全部文件，适配 fetch/WS（去掉 Vite 代理依赖，直接连 daemon origin）
- [ ] 复制 kimi-web `src/lib/` 纯工具函数
- [ ] 复制 kimi-web `src/i18n/` 词条，适配 svelte-i18n
- [ ] 复制 kimi-web `src/style.css` design tokens
- [ ] 实现 client store（对应 useKimiWebClient 核心状态）
- [ ] 实现 appearance/workspace 子 stores

### 阶段三：核心 UI 组件
- [ ] UI 原语（Button/Icon/Input/Dialog/Spinner 等约 15 个核心原语）
- [ ] Sidebar（workspace 分组 + session 列表）
- [ ] ConversationPane + ChatHeader + ChatPane
- [ ] Composer（基础输入 + slash 命令菜单）
- [ ] Markdown 流式渲染
- [ ] ToolCall / ApprovalCard / QuestionCard / TodoCard

### 阶段四：完整功能对齐
- [ ] 剩余工具渲染（Agent/Edit/Media/Swarm）
- [ ] ThinkingBlock / GoalStrip / StatusPanel
- [ ] Detail 面板（file preview / diff / thinking / agent / sideChat）
- [ ] 设置（SettingsDialog / ModelPicker / Onboarding / LoginDialog）
- [ ] mention 菜单、附件上传、输入历史
- [ ] 通知/声音

### 阶段五：桌面优雅化
- [ ] 宽屏三列布局重构
- [ ] 原生窗口打磨（macOS 透明标题栏、Windows 自绘标题栏）
- [ ] 动效与微交互
- [ ] 系统托盘、全局快捷键、原生通知、Dock 角标
- [ ] 窗口状态持久化

### 阶段六：打包与发布
- [ ] tauri.conf.json 打包配置（三平台）
- [ ] SEA staging 脚本（beforeBundleCommand）
- [ ] 代码签名（macOS Developer ID + notarization）
- [ ] CI workflow（参考现有 desktop-build.yml）
- [ ] AGENTS.md + changeset

## 9. 实现进度

### 已完成
**阶段一：脚手架 + Rust daemon**
- [x] 创建 `apps/kimi-desktop-tauri/` 完整目录结构
- [x] 前端配置：`package.json`、`tsconfig.json`、`vite.config.ts`、`svelte.config.js`
- [x] Rust 后端：`Cargo.toml`、`build.rs`、`main.rs`、`lib.rs`、`daemon.rs`、`sea_path.rs`、`commands.rs`、`tauri.conf.json`
- [x] 前端最小 Svelte app：`app.html`、`main.ts`、`env.d.ts`、`App.svelte`、`stores/daemon.svelte.ts`
- [x] 设计 token 复制：`lib/styles/global.css`（921 行）
- [x] `AGENTS.md`、`.gitignore`

**阶段二：API 层 + lib + i18n + 核心状态**
- [x] 复制 API 层 12 个文件（~7200 行）：`api/index.ts`、`config.ts`（已适配 Tauri）、`types.ts`、`errors.ts`、`daemon/{client,http,ws,wire,mappers,serverAuth,eventReducer,agentEventProjector}.ts`
- [x] 复制 lib/ 25 个纯工具函数（~2600 行）
- [x] 复制 i18n 全部 30 namespace × 2 语言（~1900 行）+ `locales/index.ts`
- [x] 复制 UI 类型定义 `types.ts`（362 行）
- [x] 复制纯逻辑模块：`messagesToTurns.ts`、`latestTodos.ts`、`swarmGroups.ts`、`eventBatcher.ts`
- [x] 适配 Vue→Svelte 依赖：
  - [x] `i18n/index.ts`：vue-i18n → svelte-i18n + 兼容 shim
  - [x] `lib/icons.ts`：unplugin-icons → 内联 SVG（421 行重写）
  - [x] `lib/desktopFlag.ts`：Tauri plugin-os 检测
  - [x] `api/config.ts`：Vite proxy → `__KIMI_DAEMON_ORIGIN__` + runtime override
  - [x] `debug/trace.ts`：no-op stub
- [x] 核心状态 store：`stores/client.svelte.ts`（~400 行，sessions/workspaces/turns/prompts/approvals/questions + 核心动作）
- [x] daemon 连接 store：`stores/daemon.svelte.ts`

**阶段三：核心 UI 组件（进行中）**
- [x] UI 原语：`Icon.svelte`、`Button.svelte`、`IconButton.svelte`
- [x] 优雅三列布局：`App.svelte`（loading/error/init/connected 四状态，可折叠侧边栏 + resize 拖拽 + macOS 红绿灯避让）
- [x] `Sidebar.svelte`（workspace 分组 + session 列表 + 新建/添加工作区）
- [x] `ConversationPane.svelte`（header + 消息区 + turns 渲染 + 空态欢迎页）
- [x] `Composer.svelte`（auto-resize textarea + Enter 发送 + 发送按钮）

### 待验证（需要 Rust 工具链 + SEA build）
- [ ] `pnpm install` 通过
- [ ] `pnpm run build` 前端构建通过
- [ ] `pnpm run typecheck` svelte-check 通过
- [ ] `pnpm run tauri:dev` 启动，能看到 loading → connected → 完整三列 UI
- [ ] daemon 健康，sessions 列表加载，能发消息

### 待办
- **阶段三剩余**：Markdown 流式渲染、ToolCall 卡片、ApprovalCard、QuestionCard、TodoCard、ThinkingBlock
- **阶段四**：完整功能对齐（工具渲染、detail 面板、设置、对话框、通知）
- **阶段五**：桌面优雅化（宽屏布局微调、原生窗口、动效、托盘/快捷键/通知）
- **阶段六**：打包与发布

## 10. 风险与注意事项

1. **Tauri WebView 差异**：Windows 用 WebView2（Chromium 内核），Linux 用 WebKitGTK，macOS 用 WKWebView。需测试 WebSocket、CSS 特性（如 `interpolate-size`）跨平台一致性。
2. **SEA staging**：Tauri 打包需在 build 前 stage SEA 到 resources，逻辑类似现有 `before-pack.cjs`。
3. **PRESUMED 端点**：kimi-web 中 models/providers/workspaces/fs:browse 部分标注为"后端未稳定"，MVP 需评估是否依赖。
4. **同步协议正确性**：snapshot → subscribe(cursor) → delta 对齐 → resync 是核心，复制 eventReducer + agentEventProjector 时必须完整，不能简化。
5. **i18n 同步**：两个 app 独立维护词条，后续 kimi-web 词条更新时需手动同步。
6. **工作区维护**：新增 `apps/kimi-desktop-tauri` 后必须同步更新 `pnpm-workspace.yaml` 和 `flake.nix`（后者手工，易遗漏）。
7. **CSP**：Tauri 默认有严格 CSP，需放行 `connect-src` 到 `http://127.0.0.1:58627`（ws:// 同理）。
8. **Rust 工具链**：monorepo 当前是纯 TS，引入 Rust 需确认 CI/本地工具链可用性。

## 11. 参考文件

- 现有 Electron 版（架构参考）：`apps/kimi-desktop/src/main/{index,ensure-server,sea-path}.ts`
- kimi-web API 层（复制源）：`apps/kimi-web/src/api/`
- kimi-web composables（重写参考）：`apps/kimi-web/src/composables/`
- kimi-web 组件（重写参考）：`apps/kimi-web/src/components/`
- kimi-web 设计系统：`apps/kimi-web/src/style.css`、`apps/kimi-web/src/views/DesignSystemView.vue`
- kimi-web AGENTS.md：`apps/kimi-web/AGENTS.md`
- 现有打包配置参考：`apps/kimi-desktop/electron-builder.config.cjs`、`apps/kimi-desktop/scripts/before-pack.cjs`
