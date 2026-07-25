# UI 原语目录（kimi-desktop-tauri）

原语库位于 `src/lib/components/ui/`。所有原语**只消费主题契约 token**（见 `src/lib/styles/global.css` 的 THEME CONTRACT 一节与 `docs/themes/*.md`），不包含任何硬编码的几何/材质/动效——同一种原语在五种设计语言下呈现五种性格。

## 主题契约速查

| 分组 | token |
|---|---|
| 几何 `--g-*` | `--g-radius-{chip,control,input,card,overlay,bubble}` `--g-border-w(-input)` `--g-border-style` `--g-border-color` |
| Elevation `--elev-*` | `--elev-{control,control-hover,input,card,card-hover,overlay,chip,bubble}` `--motion-press-shadow` |
| 材质 `--mat-*` | `--mat-surface-{1,2,3}` `--mat-blur` `--mat-sheen` `--mat-texture` `--mat-{control-bg,control-bg-hover,primary-bg,primary-bg-hover,danger-bg,input-bg,chip-bg,bubble-bg,sidebar-bg,header-bg,primary-bd}` |
| 动效 `--motion-*` | `--motion-{press,hover-lift,hover-lift-card,ease-enter,enter-anim,cta-anim}` |
| 排版 `--type-*` | `--type-control-{transform,tracking,weight}` `--type-primary-{transform,tracking,weight,text-shadow}` |

### 装饰槽机制

带表面的原语（Card / Button / Dialog / Menu）固定渲染两个伪元素槽：

- `::before` → `background: var(--mat-sheen, none)` —— 顶部高光（glass 新月、aqua 穹顶、Aurora 受光面；clay/brutal 为 `none`）。
- `::after` → `background: var(--mat-texture, none)` —— 纹理叠加（预留；条纹类纹理目前直接放在 `--mat-sidebar-bg` 等表面值里）。

主题用 `none` 关闭不需要的槽，因此**不再需要任何 `html[data-color-scheme] .cls !important` 覆盖**。

无障碍守卫是 token 级的：`prefers-reduced-transparency` / `@supports not (backdrop-filter)` 下，Aurora 与 Glass 的契约表面值整体替换为不透明色并关闭 blur/sheen；`prefers-reduced-motion` 下所有 `--motion-*` 归 `none`。

## 原语清单

| 原语 | Props | 说明 |
|---|---|---|
| `Button` | `variant: default\|primary\|ghost\|danger\|cta` `size: sm\|md` `icon?` `disabled?` `onclick?` | `cta` 带 `--motion-cta-anim`（aqua pulse / aurora glow） |
| `IconButton` | `name` `label` `variant: ghost\|default` `size?` `disabled?` `onclick?` | 图标按钮 |
| `Card` | `variant: raised\|sunken\|interactive` `padding: none\|sm\|md\|lg` | 表面基底；interactive 带 hover lift + press |
| `Input` / `Textarea` | `bind:value` `placeholder?` `disabled?` `invalid?` `size?`/`rows?` | 文本输入 |
| `Select` | `bind:value` `options: {value,label}[]` | 原生 select 包装 + chevron |
| `Switch` | `bind:checked` `label?` `onchange?` | `role="switch"` |
| `Chip` | `tone: neutral\|accent\|success\|warning\|danger\|info` `size: sm\|md` | 徽章/药丸（非交互） |
| `Segmented` | `bind:value` `options: {value,label,icon?}[]` `onchange?` | 分段控件（`role="tablist"`） |
| `ListRow` | `active?` `disabled?` `onclick?` 插槽 `leading`/默认/`trailing` | 交互时渲染 `<button>`；左侧 accent 竖条 |
| `Menu` / `MenuItem` | `MenuItem: icon? danger? disabled? onclick?` | 下拉菜单（`role="menu/menuitem"`） |
| `Dialog` | `bind:open` `title?` `onClose?` | 模态框（surface-3 + overlay elevation） |
| `Divider` | `vertical?` | 分割线 |
| `Spinner` | `size: sm\|md\|lg` | `role="progressbar"` |
| `ProgressBar` | `value: 0–100` | 进度条 |
| `Empty` / `Skeleton` / `StatusDot` / `Toasts` / `Icon` | 见源码 | 既有原语（已契约化） |
| `use:tooltip` | `actions/tooltip.ts` | 全局 tooltip（`.ux-tooltip`，契约驱动） |

## 使用约定

- 业务组件优先使用原语；复杂卡片（如 ToolCard）保留自身结构时，表面声明按 M1 模式消费契约 token（`--mat-surface-2` + `--mat-blur` + `--g-border-*` + `--g-radius-card` + `--elev-card`）。
- 原语 scoped 样式中的每个契约 token 都有兜底值（`var(--g-radius-card, 4px)`），契约缺失时可独立渲染。
- 新增主题 = 在 global.css 新增一个 `html[data-color-scheme="x"]` 契约块，填满全部契约 token；原语零改动。
