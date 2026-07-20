# Claymorphism 主题方案（第三主题，不影响默认 dark / light）

> **状态**：方案设计完成，未实施
> **分支**：`feat/claymorphism-theme`
> **核心原则**：Claymorphism 是独立的第三主题，**完全不修改**现有 dark / light 主题的任何 token。

---

## 架构设计

### 当前主题机制

```
html[data-color-scheme="dark"]   → 深色磨砂（默认）
html[data-color-scheme="light"]  → 浅色磨砂
```

### 新增第三主题

```
html[data-color-scheme="clay"]   → 粘土风格
```

用户通过设置中的主题选择器切换，`data-color-scheme` 的值变为 `clay`。现有 dark / light 的 CSS 规则**原封不动**。

### 实现方式

在 `global.css` 中**追加**一个 `html[data-color-scheme="clay"] { ... }` 块，定义全套 primitive + semantic token。不改 `:root`、不改 dark 块、不改 light 块。

---

## 完整 CSS（追加到 global.css，不改任何现有代码）

```css
/* ============================================================================
   CLAY — 粘土风格（第三主题，独立于 dark / light）
   温暖浅米色背景 + 独立粉彩粘土表面 + 立体内阴影。
   文字对比度 ≥ 4.5:1。
============================================================================ */
html[data-color-scheme="clay"] {
  /* ---- primitives ---- */
  --bg: #f5f0e9;
  --l1: #faf7f2;          /* 凹陷表面（输入框背景） */
  --l2: #ecc9b8;          /* 主粘土表面 — 蜜桃 */
  --l3: #efe2c6;          /* 高亮粘土表面 — 黄油 */

  --bd: rgba(55, 28, 10, 0.08);
  --bd2: rgba(55, 28, 10, 0.15);

  --tx: #1a0d05;
  --tx2: #3d2618;
  --tx3: #5c4030;

  --ac: #c8612e;
  --ac-h: #b05525;
  --ac-soft: rgba(200, 97, 46, 0.12);
  --ac-bd: rgba(200, 97, 46, 0.28);

  --ok: #4a7c59;
  --ok-soft: rgba(74, 124, 89, 0.12);
  --warn: #8a6914;
  --warn-soft: rgba(138, 105, 20, 0.12);
  --err: #9c3d4e;
  --err-soft: rgba(156, 61, 78, 0.12);
  --amb: #9a4a00;
  --amb-soft: rgba(154, 74, 0, 0.10);

  /* 粘土阴影：外投影 + 内暗影(底) + 内高光(顶) */
  --toplight: inset 0 2px 4px rgba(255, 255, 255, 0.55);
  --sh:
    0 12px 24px rgba(55, 28, 10, 0.14),
    inset 0 -6px 12px rgba(55, 28, 10, 0.10),
    inset 0 4px 10px rgba(255, 255, 255, 0.50);
  --sh-lg:
    0 24px 40px rgba(55, 28, 10, 0.18),
    inset 0 -8px 16px rgba(55, 28, 10, 0.15),
    inset 0 8px 16px rgba(255, 255, 255, 0.55);

  --overlay: rgba(55, 28, 10, 0.25);

  /* 背景光斑（替代 dark/light 的 haze） */
  --haze:
    radial-gradient(40% 50% at 15% 20%, rgba(232, 213, 200, 0.5), transparent),
    radial-gradient(35% 45% at 85% 75%, rgba(208, 228, 220, 0.4), transparent),
    radial-gradient(30% 40% at 50% 50%, rgba(221, 208, 234, 0.3), transparent);

  --grain-op: 0.02;

  /* 代码高亮（暖色调） */
  --syn-k: #9c3d4e;
  --syn-s: #4a7c59;
  --syn-f: #c8612e;
  --syn-n: #8a6914;

  /* ---- semantic layer（与 dark/light 完全相同的别名映射） ---- */
  --color-bg: var(--bg);
  --color-surface: var(--l1);
  --color-surface-raised: var(--l2);
  --color-surface-sunken: var(--bg);
  --color-sidebar-bg: var(--l1);
  --color-text: var(--tx);
  --color-text-muted: var(--tx2);
  --color-text-faint: var(--tx3);
  --color-text-on-accent: #ffffff;
  --color-line: var(--bd);
  --color-line-strong: var(--bd2);
  --color-selected: var(--ac-soft);
  --color-hover: rgba(55, 28, 10, 0.04);
  --color-accent: var(--ac);
  --color-accent-hover: var(--ac-h);
  --color-accent-soft: var(--ac-soft);
  --color-accent-bd: var(--ac-bd);
  --accent-primary: var(--ac);
  --color-success: var(--ok);
  --color-success-soft: var(--ok-soft);
  --color-success-bd: rgba(74, 124, 89, 0.26);
  --color-warning: var(--warn);
  --color-warning-soft: var(--warn-soft);
  --color-warning-bd: rgba(138, 105, 20, 0.26);
  --color-danger: var(--err);
  --color-danger-soft: var(--err-soft);
  --color-danger-bd: rgba(156, 61, 78, 0.24);
  --color-done: #7b5cb8;
  --color-done-soft: rgba(123, 92, 184, 0.12);
  --color-done-bd: rgba(123, 92, 184, 0.24);
  --color-info: var(--ac);
  --color-logo-dev: #c8612e;
  --glass-divider: var(--bd);

  --shadow-xs: 0 2px 4px rgba(55, 28, 10, 0.06);
  --shadow-sm: 0 2px 6px rgba(55, 28, 10, 0.08);
  --shadow-md: 0 6px 16px rgba(55, 28, 10, 0.10), inset 0 -3px 6px rgba(55, 28, 10, 0.06);
  --shadow-lg: var(--sh-lg);
  --shadow-xl: 0 32px 80px rgba(55, 28, 10, 0.22), inset 0 -10px 20px rgba(55, 28, 10, 0.12);

  --p-focus-ring: 0 0 0 3px rgba(200, 97, 46, 0.20);
  --p-focus-ring-strong: 0 0 0 3px rgba(200, 97, 46, 0.20), 0 0 0 1px var(--ac);
  --p-selection: rgba(200, 97, 46, 0.18);

  color-scheme: light;
}

/* ---- Clay 专属粘土色板（仅 clay 主题可见） ---- */
html[data-color-scheme="clay"] {
  --clay-peach: #ecc9b8;
  --clay-mint: #c2e4d2;
  --clay-lavender: #dacded;
  --clay-butter: #efe2c6;
  --clay-sky: #c4dcee;
  --clay-rose: #ecccd8;
  --clay-sage: #cddac4;

  --shadow-warm: 55, 28, 10;
  --shadow-cool: 20, 38, 30;
  --shadow-lav: 38, 22, 48;
}

/* ---- Clay 交互状态阴影（仅 clay 主题生效） ---- */
html[data-color-scheme="clay"] .clay-hover {
  transition: box-shadow var(--duration-base) var(--ease);
}
html[data-color-scheme="clay"] .clay-hover:hover {
  box-shadow:
    0 20px 36px rgba(55, 28, 10, 0.20),
    inset 0 -8px 16px rgba(55, 28, 10, 0.14),
    inset 0 6px 14px rgba(255, 255, 255, 0.55);
}
html[data-color-scheme="clay"] .clay-hover:active {
  box-shadow:
    0 4px 8px rgba(55, 28, 10, 0.08),
    inset 0 -4px 10px rgba(55, 28, 10, 0.22),
    inset 0 4px 10px rgba(255, 255, 255, 0.35);
}
```

---

## 前端接入（1 处改动）

主题选择器需要新增 `clay` 选项。当前 `setColorScheme` 只接受 `'light' | 'dark' | 'system'`。

### client.svelte.ts

```ts
// 类型扩展
colorScheme: 'system' as 'light' | 'dark' | 'system' | 'clay',

// setColorScheme 不变（已经写 data-color-scheme 属性）
```

### ConfigDialog.svelte / Onboarding.svelte

主题选择器加一个按钮：

```svelte
{#each [['dark', '深色'], ['light', '浅色'], ['clay', '粘土'], ['system', '跟随系统']] as [val, label]}
```

---

## 不受影响的部分

| 项目 | 说明 |
|------|------|
| Dark 主题 | `html[data-color-scheme="dark"]` 规则**完全不动** |
| Light 主题 | `html[data-color-scheme="light"]` 规则**完全不动** |
| `:root` 共享 token | radius / spacing / z-index / motion / font / type scale **不动** |
| 所有 43 个 Svelte 组件 | 零改动（通过 semantic alias 自动继承） |
| Rust 后端 | 零改动 |
| 打包 / CI | 零改动 |

---

## 实施步骤（后续执行时参考）

1. 在 `global.css` 末尾**追加** clay 主题 CSS 块（~100 行，纯新增）
2. `client.svelte.ts` 的 `colorScheme` 类型加 `| 'clay'`（1 行）
3. ConfigDialog + Onboarding 主题选择器加"粘土"按钮（2 处，各 1 行）
4. 测试：切到 clay 主题，验证文字对比度 + 阴影立体感
5. 提交推送

**总改动量**：~100 行新增 CSS + 3 行 TS/Svelte。零删除、零修改现有代码。

---

## Clay 各表面的配色映射

| 当前 token | Clay 值 | 视觉效果 |
|-----------|---------|----------|
| `--bg` | `#f5f0e9` | 温暖浅米色页面背景 |
| `--l1` (sidebar / 凹陷面) | `#faf7f2` | 极浅米白（输入框、侧栏） |
| `--l2` (主表面 / 按钮) | `#ecc9b8` | 蜜桃粘土（卡片、气泡、按钮） |
| `--l3` (高亮面 / Dialog) | `#efe2c6` | 黄油粘土（弹窗、高亮区） |
| `--tx` (主文字) | `#1a0d05` | 极深暖棕（≈9:1 对比度） |
| `--ac` (强调色) | `#c8612e` | 深蜜桃（CTA 按钮、链接） |
| `--sh` (投影) | 三层粘土阴影 | 外投影 + 内暗影 + 内高光 |

---

## 阴影配方说明

Clay 阴影 = **外投影**（漂浮感）+ **内暗影底部**（厚度感）+ **内高光顶部**（受光感）：

```
box-shadow:
  0 12px 24px rgba(55, 28, 10, 0.14),        /* 外投影：漂浮 */
  inset 0 -6px 12px rgba(55, 28, 10, 0.10),  /* 内暗影底：厚度 */
  inset 0 4px 10px rgba(255, 255, 255, 0.50); /* 内高光顶：受光 */
```

交互状态：
- **hover**：外投影扩大 + 透明度增加 → "抬起"感
- **active/pressed**：外投影减弱 + 内暗影加深 → "压入"感
- **输入框**：反向（内凹）—— 内暗影在上、内高光在下
