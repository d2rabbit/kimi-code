# Aurora Tile — 旗舰设计语言（dark / light / system）

Frutiger Aero 的自然有机 × Win8 Metro 的磁贴几何。动态极光天空背景上的三层半透明玻璃磁贴。dark / light / system 是同一语言的暗 / 明 / 自动三模式，契约值通过 `var(--l*-glass)` 等引用各自 primitives 自动翻转。

## 几何

| 部位 | 值 |
|---|---|
| chip | 2px |
| 控件 / 输入 / 卡片 | 4px（磁贴硬角统一） |
| overlay / 气泡 | 6px |
| 边框 | 1px 实线，`--bd-glass` 折射边色 |

## 材质

- 表面：`--l1/l2/l3-glass` 三层半透明（0.55 / 0.65 / 0.78 不透明度），`backdrop-filter: blur(16px) saturate(1.4)`。
- sheen 槽：顶部 55% 白色渐变（`--shine-overlay`），玻璃受光面。
- 背景：body 极光漂移层（`--aurora-bg` 四团径向渐变 + `aurora-drift`）+ 全局噪点颗粒。
- 主按钮：`--ac-gradient`（蓝→青绿 135° 品牌渐变）。

## Elevation

柔和弥散阴影（`--shadow-sm..xl` 双层：环境光 + 直射光）+ inset 顶光（`--toplight`）。按压不改变阴影。

## 动效

- 按压：`scale(0.97)`；hover：`translateY(-1px)`（控件）/ `-2px`（卡片）。
- 入场：`aero-drop-in`（scale 0.92 + 上浮，200ms ease-out）。
- CTA：`newtask-glow` 3s 呼吸光晕；hover 时 `hover-glow` 光环脉动。
- 缓动：入场 `--ease-out`，弹性 `--ease-spring`。

## 排版

Inter Variable；控件字重 500，主按钮 600；无字距/大小写变换。

## Do / Don't

- ✅ 表面永远半透明 + 模糊，让极光背景透出来。
- ✅ 阴影柔和、低存在感；深度靠透明度层级而非重阴影。
- ❌ 不要实色不透明卡片（reduced-transparency 守卫除外）。
- ❌ 不要硬偏移阴影、不要大于 6px 的圆角。
